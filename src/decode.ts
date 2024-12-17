import type { Result } from "./api";
import type { EncodingElement, Mode } from "./encode";
import { type AstOperand, toString } from "./syntax";
import {
  instrToString,
  instructions,
  regName,
  X86Size,
  type InstructionDefinition,
  type Opcode,
  type Operand,
  type Register,
} from "./x86";

type Branch = { value: number; node: DecoderNode };

type DecoderNode =
  | { t: "MatchOpcodeNode"; nexts: Branch[] }
  | { t: "NextOpcode"; next: DecoderNode }
  | { t: "ExtractReg"; next: DecoderNode }
  | { t: "MatchRegNode"; nexts: Branch[] }
  | { t: "ExtractModRM"; next: DecoderNode }
  | { t: "InstructionNode"; instr: InstructionDefinition }
  | { t: "PrefixNode" }
  | { t: "UnknownNode" };

type PendingOpcodes = { opcodes: Opcode[]; instr: InstructionDefinition };

const root: DecoderNode = decoderRoot();

function decoderRoot(): DecoderNode {
  const nexts = buildBranches(
    instructions
      .map(
        (instr) => ({ opcodes: instr.opcodes, instr: instr }) as PendingOpcodes
      )
      .flatMap((p) => extractOpcodes(p))
  );
  nexts.push({ value: 0x66, node: { t: "PrefixNode" } });
  return { t: "MatchOpcodeNode", nexts };
}

function buildMatchOpcode(
  pendings: { value: number; pending: PendingOpcodes }[]
): DecoderNode {
  return { t: "MatchOpcodeNode", nexts: buildBranches(pendings) };
}

function buildBranches(
  pendings: { value: number; pending: PendingOpcodes }[]
): Branch[] {
  const groups = new Map<number, PendingOpcodes[]>();
  pendings.forEach((p) => {
    let g = groups.get(p.value);
    if (!g) {
      g = [];
      groups.set(p.value, g);
    }
    g.push(p.pending);
  });
  const nexts: Branch[] = [];
  groups.forEach((l, v) => nexts.push({ value: v, node: processGroup(l) }));
  return nexts;
}

function processGroup(group: PendingOpcodes[]): DecoderNode {
  if (group.length === 1) {
    const node = processOpcodes(group[0]);
    return node ? node : { t: "UnknownNode" };
  }
  const next = group.map((g) => advance(g));
  if (hasAllOpcodes(next)) {
    return {
      t: "NextOpcode",
      next: buildMatchOpcode(next.flatMap(extractOpcodes)),
    };
  } else {
    return {
      t: "NextOpcode",
      next: {
        t: "ExtractModRM",
        next: { t: "MatchRegNode", nexts: next.flatMap(extractExtensions) },
      },
    };
  }
}

function advance(pending: PendingOpcodes): PendingOpcodes {
  if (pending.opcodes.length > 0) {
    return { ...pending, opcodes: pending.opcodes.slice(1) };
  }
  return pending;
}

function processOpcodes(pending: PendingOpcodes): DecoderNode | undefined {
  if (pending.opcodes.length === 0) {
    return { t: "InstructionNode", instr: pending.instr };
  }
  if (pending.opcodes[0].t === "O") {
    return {
      t: "NextOpcode",
      next: processGroup([{ ...pending, opcodes: pending.opcodes.slice(1) }]),
    };
  }
  if (pending.opcodes[0].t === "O_R") {
    return {
      t: "ExtractReg",
      next: processGroup([{ ...pending, opcodes: pending.opcodes.slice(1) }]),
    };
  }
  if (pending.opcodes[0].t === "E") {
    return {
      t: "ExtractModRM",
      next: {
        t: "MatchRegNode",
        nexts: [
          {
            value: pending.opcodes[0].value,
            node: processGroup([
              { ...pending, opcodes: pending.opcodes.slice(1) },
            ]),
          },
        ],
      },
    };
  }
  if (pending.opcodes[0].t === "MODRM") {
    return {
      t: "ExtractModRM",
      next: processGroup([{ ...pending, opcodes: pending.opcodes.slice(1) }]),
    };
  }
  throw new Error("TODO");
}

function hasAllOpcodes(pendings: PendingOpcodes[]): boolean {
  return pendings.every((p) => p.opcodes.length > 0 && p.opcodes[0].t === "O");
}

function extractOpcodes(
  pending: PendingOpcodes
): { value: number; pending: PendingOpcodes }[] {
  const e = pending.opcodes[0];
  if (e.t === "O") {
    return [{ value: e.value, pending: pending }];
  } else if (e.t === "O_R") {
    return Array.from(Array(8).keys()).map((i) => ({
      value: e.value | i,
      pending,
    }));
  } else {
    return [];
  }
}

function extractExtensions(pending: PendingOpcodes): Branch[] {
  if (pending.opcodes.length > 0 && pending.opcodes[0].t === "E") {
    return [
      {
        value: pending.opcodes[0].value,
        node: processOpcodes(advance(pending)) ?? { t: "UnknownNode" },
      },
    ];
  }
  return [];
}

type DecodeContext = {
  bytes: number[];
  length: number;
  error: string;
  node: DecoderNode;
  pc: number;
  is32bits: boolean;
  reg?: number;
  mode?: Mode;
  rm?: number;
  instr?: InstructionDefinition;
  elements: EncodingElement[];
  operands: AstOperand[];
};

export function decode(is32bits: boolean, content: string): Result {
  let bytes = toBytes(content);
  return decodeFromBytes(is32bits, bytes);
}

export function decodeFromBytes(is32bits: boolean, bytes: number[]): Result {
  let context = decodeFromContext({
    bytes,
    length: bytes.length,
    error: "",
    node: root,
    pc: 0x8000000,
    is32bits,
    reg: undefined,
    mode: undefined,
    rm: undefined,
    instr: undefined,
    elements: [],
    operands: [],
  });

  return {
    errors: context.error ? [{ msg: context.error }] : [],
    instructions: context.instr
      ? [
          {
            name: instructionName(context.instr, context.operands),
            encoding: context.elements,
          },
        ]
      : [],
  };
}

function instructionName(
  instr: InstructionDefinition,
  operands: AstOperand[]
): string {
  return (
    toString({ name: instr.name, operands }) +
    "  (" +
    instrToString(instr) +
    ")"
  );
}

function decodeFromContext(context: DecodeContext): DecodeContext {
  if (context.node.t === "MatchOpcodeNode") {
    const op = context.bytes[0];
    if (op !== undefined) {
      const n = context.node.nexts.find((n) => n.value === op);
      if (n) {
        return decodeFromContext({ ...context, node: n.node });
      }
      return { ...context, error: `Unknown Opcode ${op.toString(16)}` };
    } else {
      return { ...context, error: "Not enough bytes" };
    }
  }
  if (context.node.t === "NextOpcode") {
    return decodeFromContext({
      ...context,
      node: context.node.next,
      bytes: context.bytes.slice(1),
      elements: [...context.elements, { t: "Opcode", value: context.bytes[0] }],
    });
  }
  if (context.node.t === "ExtractModRM") {
    return decodeFromContext(
      extractModRM(context.bytes[0], {
        ...context,
        node: context.node.next,
        bytes: context.bytes.slice(1),
      })
    );
  }
  if (context.node.t === "InstructionNode") {
    return decodeOperands(context.node.instr, context);
  }
  if (context.node.t === "ExtractReg") {
    return decodeFromContext(
      extractReg(context.bytes[0], {
        ...context,
        node: context.node.next,
        bytes: context.bytes.slice(1),
      })
    );
  }
  if (context.node.t === "MatchRegNode") {
    const r = context.reg ?? -1;
    const branch = context.node.nexts.find((b) => b.value === r);
    if (branch !== undefined) {
      return decodeFromContext({
        ...context,
        elements: patchRegWithExt(context),
        node: branch.node,
      });
    }
    return { ...context, error: "Unknown" };
  }
  if (context.node.t === "PrefixNode") {
    if (context.bytes[0] !== 0x66) {
      return {
        ...context,
        error: `Unknown prefix ${context.bytes[0].toString(16)}`,
      };
    } else {
      return decodeFromContext({
        ...context,
        is32bits: !context.is32bits,
        bytes: context.bytes.slice(1),
        node: root,
      });
    }
  }
  return { ...context, error: `NEXT ${context.node.t}` };
  //     (UnknownNode, _) -> { context | error = Debug.toString decoderRoot }
  return { ...context, error: "Not enough bytes" };
}

function patchRegWithExt(context: DecodeContext): EncodingElement[] {
  return context.elements.map((e) => {
    if (e.t === "ModRM") {
      return { ...e, reg: { t: "EXT", value: context.reg! } };
    } else {
      return e;
    }
  });
}

function patchRmWith(context: DecodeContext, size: X86Size): EncodingElement[] {
  return context.elements.map((e) => {
    if (e.t === "ModRM") {
      return {
        ...e,
        rm: { t: "REG", name: decodeRegName(size, context.rm!) },
      };
    } else {
      return e;
    }
  });
}

function patchRegWith(
  context: DecodeContext,
  size: X86Size
): EncodingElement[] {
  return context.elements.map((e) => {
    if (e.t === "ModRM") {
      return {
        ...e,
        reg: { t: "REG", name: decodeRegName(size, context.reg!) },
      };
    } else {
      return e;
    }
  });
}

function extractReg(x: number, context: DecodeContext): DecodeContext {
  let opcode = (x >> 3) & 0x1f;
  let reg = x & 7;
  return {
    ...context,
    reg,
    elements: [
      ...context.elements,
      { t: "OpcodeAndReg", opcode, register: reg },
    ],
  };
}

function extractModRM(x: number, context: DecodeContext): DecodeContext {
  const mode = decodeMode((x >> 6) & 3);
  const reg = (x >> 3) & 7;
  const rm = x & 7;
  const size = context.is32bits ? X86Size.S_32 : X86Size.S_16; // TODO size could be 8
  return {
    ...context,
    mode,
    reg,
    rm,
    elements: [
      ...context.elements,
      {
        t: "ModRM",
        mode,
        reg: { t: "REG", name: decodeRegName(size, reg) },
        rm: { t: "REG", name: decodeRegName(size, rm) }, // TODO depend on mode for SIB
      },
    ],
  };
}

function decodeMode(mode: number): Mode {
  switch (mode) {
    case 0:
      return "MEMORY";
    case 1:
      return "MEMORY_DISP8";
    case 2:
      return "MEMORY_DISP32";
    default:
      return "REG";
  }
}

function decodeOperands(
  instr: InstructionDefinition,
  context: DecodeContext
): DecodeContext {
  let current: DecodeContext = { ...context, instr };
  instr.operands.forEach((operand) => {
    current = decodeOperand(operand, current);
  });
  return current;
}

function decodeOperand(
  operand: Operand,
  context: DecodeContext
): DecodeContext {
  if (operand.t === "R") {
    return decodeReg(operand.size, context);
  }
  if (operand.t === "Register") {
    return decodeFixedRegister(operand.size, operand.name, context);
  }
  if (operand.t === "RM") {
    return decodeRM(operand.size, context);
  }
  if (operand.t === "I") {
    return decodeImm(operand.size, context);
  }
  if (operand.t === "REL") {
    return decodeRel(operand.size, context);
  }
  return {
    ...context,
    error: context.error + " >> " + JSON.stringify(operand),
  };
}

function decodeReg(size: X86Size, context: DecodeContext): DecodeContext {
  if (context.reg === undefined) {
    return {
      ...context,
      error: "No register to decode",
    };
  }
  const regSize = getContextSize(size, context);
  const operand: AstOperand = {
    kind: "Register",
    name: decodeRegName(regSize, context.reg),
  };
  return {
    ...context,
    elements:
      regSize == X86Size.S_8
        ? patchRegWith(context, X86Size.S_8)
        : context.elements,
    operands: [...context.operands, operand],
  };
}

function getContextSize(size: X86Size, context: DecodeContext) {
  if (size === X86Size.S_16_32) {
    if (context.is32bits) return X86Size.S_32;
    else return X86Size.S_16;
  } else {
    return size;
  }
}

function decodeRM(size: X86Size, context: DecodeContext): DecodeContext {
  let newContext = context;
  let operand: AstOperand;
  if (context.mode === "REG") {
    operand = {
      kind: "Register",
      name: decodeRegName(getContextSize(size, context), context.rm ?? 0),
    };
  } else if (context.mode === "MEMORY") {
    if (context.rm === 4) {
      return { ...context, error: `TODO decodeRM  SIB no disp` };
    } else if (context.rm === 5) {
      const s = getContextSize(size, context);
      const { value: v, context: nc } = context.is32bits
        ? getLong(context)
        : getWord(context);
      const value = v ?? 0;
      operand = {
        kind: "EffectiveAddress",
        address: {
          size: s,
          displacement: value,
        },
      };
      return {
        ...nc,
        elements: [...nc.elements, { t: "Immediate", size: s, value }], // TODO patch rm -> SPECIAL EBP
        operands: [...nc.operands, operand],
      };
    } else if (context.rm !== undefined) {
      operand = {
        kind: "EffectiveAddress",
        address: {
          size: size,
          base: decodeRegName(
            X86Size.S_32, // TODO MEMORY is NOT always 32bits (add addressSize to context)
            context.rm
          ),
          displacement: 0,
        },
      };
      return {
        ...newContext,
        elements: patchRmWith(newContext, X86Size.S_32),
        operands: [...newContext.operands, operand],
      };
    } else {
      return { ...context, error: "expecting modrm" };
    }
  } else if (context.mode === "MEMORY_DISP8") {
    if (context.rm === 4) {
      return { ...context, error: `TODO decodeRM  SIB with DISP8` };
    } else {
      const { value: v, context: newContext } = getSignedByte(context);
      const value = v ?? 0;
      operand = {
        kind: "EffectiveAddress",
        address: {
          base: decodeRegName(
            context.is32bits ? X86Size.S_32 : X86Size.S_16,
            context.rm!
          ),
          size: context.is32bits ? X86Size.S_32 : X86Size.S_16,
          displacement: value,
        },
      };
      return { ...newContext, operands: [...newContext.operands, operand] };
    }
  } else {
    return { ...context, error: `TODO decodeRM ${context.mode}/${context.rm}` };
  }
  return { ...newContext, operands: [...newContext.operands, operand] };
}

function decodeRel(size: X86Size, context: DecodeContext): DecodeContext {
  const realSize =
    size !== X86Size.S_16_32
      ? size
      : context.is32bits
        ? X86Size.S_32
        : X86Size.S_16;
  const { value, context: newContext } =
    realSize === X86Size.S_8
      ? getByte(context)
      : realSize === X86Size.S_16
        ? getWord(context)
        : getLong(context);
  if (value !== undefined) {
    const newPc =
      newContext.pc + value + (newContext.length - newContext.bytes.length);
    return {
      ...newContext,
      operands: [...newContext.operands, { kind: "Immediate", value: newPc }],
      elements: [
        ...context.elements,
        { t: "Immediate", size: realSize, value },
      ],
    };
  }
  return newContext;
}

function decodeRegName(size: X86Size, r: number): string {
  switch (size) {
    case X86Size.S_8:
      return ["AL", "CL", "DL", "BL", "AH", "CH", "DH", "BH"][r];
    case X86Size.S_16:
      return ["AX", "CX", "DX", "BX", "SP", "BP", "SI", "DI"][r];
    case X86Size.S_32:
      return ["EAX", "ECX", "EDX", "EBX", "ESP", "EBP", "ESI", "EDI"][r];
    default:
      throw "impossible reg 16/32";
  }
}

function decodeFixedRegister(
  size: X86Size,
  reg: Register,
  context: DecodeContext
): DecodeContext {
  return {
    ...context,
    operands: [
      ...context.operands,
      { kind: "Register", name: regName(getContextSize(size, context), reg) },
    ],
  };
}

function decodeImm(size: X86Size, context: DecodeContext): DecodeContext {
  let s = getContextSize(size, context);
  let result;
  switch (s) {
    case X86Size.S_8:
      result = getByte(context);
      break;
    case X86Size.S_16:
      result = getWord(context);
      break;
    default:
      result = getLong(context);
  }
  if (result.value !== undefined) {
    return {
      ...result.context,
      operands: [
        ...result.context.operands,
        { kind: "Immediate", value: result.value },
      ],
      elements: [
        ...result.context.elements,
        { t: "Immediate", size: s, value: result.value },
      ],
    };
  }
  return result.context;
}

function getSignedByte(context: DecodeContext) {
  let { value, context: nc } = getByte(context);
  if (value && value & 0x80) {
    value -= 0x100;
  }
  return { value, context: nc };
}

function getByte(context: DecodeContext) {
  if (context.bytes.length >= 1) {
    return {
      value: context.bytes[0],
      context: { ...context, bytes: context.bytes.slice(1) },
    };
  }
  return {
    value: undefined,
    context: { ...context, error: "Not enough bytes" },
  };
}

function getWord(context: DecodeContext) {
  if (context.bytes.length >= 2) {
    return {
      value: (context.bytes[1] << 8) | context.bytes[0],
      context: { ...context, bytes: context.bytes.slice(2) },
    };
  }
  return {
    value: undefined,
    context: { ...context, error: "Not enough bytes" },
  };
}

function getLong(context: DecodeContext) {
  if (context.bytes.length >= 4) {
    let value = 0;
    for (let i = 0; i < 4; ++i) {
      value |= context.bytes[i] << (i * 8);
    }
    return {
      value,
      context: { ...context, bytes: context.bytes.slice(4) },
    };
  }
  return {
    value: undefined,
    context: { ...context, error: "Not enough bytes" },
  };
}

function toBytes(content: string): number[] {
  const result: number[] = [];
  let current = undefined;
  for (let i = 0; i < content.length; ++i) {
    const c = content[i].toLowerCase();
    if ((c >= "0" && c <= "9") || (c >= "a" && c <= "f")) {
      const v = parseInt(c, 16);
      if (current === undefined) {
        current = v;
      } else {
        result.push((current << 4) | v);
        current = undefined;
      }
    }
  }
  if (current !== undefined) {
    result.push(current);
  }
  return result;
}
