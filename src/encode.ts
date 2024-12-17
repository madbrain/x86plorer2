import type { AstInstr, AstOperand, MemoryOperand } from "./syntax";
import { X86Size, type InstructionDefinition, type Operand } from "./x86";

export type Mode = "REG" | "MEMORY" | "MEMORY_DISP8" | "MEMORY_DISP32";

export type EncodingElement =
  | { t: "Prefix"; value: number }
  | { t: "Opcode"; value: number }
  | { t: "OpcodeAndReg"; opcode: number; register: number }
  | { t: "Immediate"; size: X86Size; value: number }
  | { t: "ModRM"; mode: Mode; reg: RegisterValue; rm: RMValue }
  | { t: "Sib"; reg: number; index: number; scale: number }
  | { t: "Disp8"; value: number }
  | { t: "Disp32"; value: number };

type MemoryContext = {
  isReg: boolean;
  base: string | undefined;
  index?: { register: number; scale: Scale };
  disp?: number;
};

export type Scale = 1 | 2 | 4 | 8;

export type RegisterValue =
  | { t: "REG"; name: string }
  | { t: "EXT"; value: number };

export type RMValue = { t: "REG"; name: string } | { t: "SIB" };

type EncodingContext = {
  pc: number;
  elements: EncodingElement[];
  reg?: RegisterValue;
  rm?: MemoryContext;
  is32bits: boolean;
};
type OperandTuple = { def: Operand; operand: AstOperand };

export function encode(
  is32bits: boolean,
  inst: InstructionDefinition,
  operands: AstOperand[]
) {
  if (inst.operands.length != operands.length) {
    return undefined;
  }
  const context: EncodingContext = {
    pc: 0x8000000,
    elements: [],
    reg: undefined,
    rm: undefined,
    is32bits: is32bits,
  };

  checkOperandSizePrefix(inst, operands, context);

  const tuples = inst.operands.map((d, i) => ({
    def: d,
    operand: operands[i],
  }));

  inst.opcodes.forEach((opcode) => {
    if (opcode.t === "O") {
      context.elements.push({ t: "Opcode", value: opcode.value });
    } else if (opcode.t === "O_R") {
      context.elements.push({
        t: "OpcodeAndReg",
        opcode: opcode.value >> 3,
        register: extractRegister(tuples),
      });
    } else if (opcode.t === "E") {
      context.reg = { t: "EXT", value: opcode.value };
    }
  });
  tuples.forEach((tuple) => {
    encodeOperand(context, tuple.def, tuple.operand);
  });
  return context.elements;
}

function checkOperandSizePrefix(
  inst: InstructionDefinition,
  operands: AstOperand[],
  context: EncodingContext
) {
  if (
    inst.operands.some(
      (o) =>
        (o.t === "R" && o.size === X86Size.S_16_32) ||
        (o.t === "RM" && o.size === X86Size.S_16_32)
    )
  ) {
    let size: X86Size | undefined = undefined;
    operands.forEach((op) => {
      const c =
        op.kind === "Register"
          ? getRegSize(op.name)
          : op.kind === "EffectiveAddress"
            ? op.address.size
            : undefined;
      if (c) {
        if (size && c !== size) {
          console.log("OPERAND SIZE MISMATCH"); // TODO should return error
        } else {
          size = c;
        }
      }
    });
    if (
      (context.is32bits && size === X86Size.S_16) ||
      (!context.is32bits && size === X86Size.S_32)
    ) {
      context.is32bits = !context.is32bits;
      context.elements.push({ t: "Prefix", value: 0x66 });
    }
  }
}

function encodeOperand(
  context: EncodingContext,
  operandDef: Operand,
  operand: AstOperand
) {
  if (operandDef.t === "RM" && operand.kind === "EffectiveAddress") {
    addMemoryTo(context, extractMemory(operand.address));
  } else if (operandDef.t === "RM" && operand.kind === "Register") {
    addMemoryTo(context, {
      isReg: true,
      base: operand.name.toUpperCase(),
    });
  } else if (operandDef.t === "R" && operand.kind === "Register") {
    const r: RegisterValue = { t: "REG", name: operand.name.toUpperCase() };
    if (context.rm !== undefined && r != undefined) {
      encodeCompleteOperands(r, context.rm, context);
    } else {
      context.reg = r;
    }
  } else if (operandDef.t === "I" && operand.kind === "Immediate") {
    encodeReq(
      {
        t: "Immediate",
        size: getSize(operandDef.size, context.is32bits),
        value: operand.value,
      },
      context
    );
  } else if (operandDef.t === "REL" && operand.kind === "Immediate") {
    encodeReq(
      {
        t: "Immediate",
        size: getSize(operandDef.size, context.is32bits),
        value: operand.value - context.pc - encodingSize(context.elements) - 4,
      },
      context
    );
  }
  // TODO add prefix
}

export function encodingSize(encoding: EncodingElement[]) {
  let result = 0;
  encoding.forEach((e) => {
    switch (e.t) {
      case "Opcode":
      case "OpcodeAndReg":
      case "ModRM":
        result += 1;
        break;
      case "Immediate": {
        switch (e.size) {
          case X86Size.S_8:
            result += 1;
            break;
          case X86Size.S_16:
            result += 2;
            break;
          case X86Size.S_32:
            result += 4;
            break;
          default:
            throw `IMM SIZE ${JSON.stringify(e)}`;
        }
        break;
      }
      default:
        throw `TODO ${e.t}`;
    }
  });
  return result;
}

function getSize(size: X86Size, is32bits: boolean): X86Size {
  if (size === X86Size.S_8) return X86Size.S_8;
  if (size === X86Size.S_16) return X86Size.S_16;
  if (size === X86Size.S_32) return X86Size.S_32;
  if (size === X86Size.S_16_32) return is32bits ? X86Size.S_32 : X86Size.S_16;
  throw new Error("impossible");
}

// TODO memory could be invalid as not every registers could be used as index
function extractMemory(memory: MemoryOperand): MemoryContext {
  let mi = memory.index
    ? { scale: memory.index.scale, register: encodeReg(memory.index.register) }
    : undefined;
  if (memory.displacement == 0) {
    return {
      isReg: false,
      base: memory.base?.toUpperCase(),
      index: mi,
      disp: undefined,
    };
  } else {
    return {
      isReg: false,
      base: memory.base,
      index: mi,
      disp: memory.displacement,
    };
  }
}

function addMemoryTo(context: EncodingContext, memory: MemoryContext) {
  if (context.reg !== undefined) {
    encodeCompleteOperands(context.reg, memory, context);
  } else {
    context.rm = memory;
  }
}

function encodeCompleteOperands(
  reg: RegisterValue,
  rm: MemoryContext,
  context: EncodingContext
) {
  if (rm.isReg === true && rm.base !== undefined) {
    context.elements.push({
      t: "ModRM",
      mode: "REG",
      reg,
      rm: { t: "REG", name: rm.base },
    });
  } else if (rm.base !== undefined && rm.index === undefined) {
    let { mode, disp } = makeDisp(rm.disp);
    encodeReq(
      { t: "ModRM", mode, reg, rm: { t: "REG", name: rm.base } },
      context
    );
    encodeOpt(disp, context);
  } else if (rm.base !== undefined && rm.index !== undefined) {
    let { mode, disp } = makeDisp(rm.disp);
    encodeReq({ t: "ModRM", mode, reg, rm: { t: "SIB" } }, context);
    encodeReq(
      {
        t: "Sib",
        reg: encodeReg(rm.base),
        index: rm.index.register,
        scale: rm.index.scale,
      },
      context
    );
    encodeOpt(disp, context);
  } else if (rm.base === undefined && rm.index !== undefined) {
    encodeReq({ t: "ModRM", mode: "MEMORY", reg, rm: { t: "SIB" } }, context);
    encodeReq(
      {
        t: "Sib",
        reg: encodeReg("EBP"),
        index: rm.index.register,
        scale: rm.index.scale,
      },
      context
    );
    encodeReq(
      { t: "Disp32", value: rm.disp !== undefined ? rm.disp : 0 },
      context
    );
  }
}

function extractRegister(operands: OperandTuple[]): number {
  for (let tuple of operands) {
    if (tuple.def.t === "R" && tuple.operand.kind === "Register") {
      return encodeReg(tuple.operand.name);
    }
  }
  return 0; // TODO impossible
}

export function encodeRegister(r: RegisterValue) {
  if (r.t === "REG") {
    return encodeReg(r.name);
  }
  return r.value;
}

function getRegSize(name: string): X86Size {
  const n = name.toUpperCase();
  if (n.startsWith("E")) return X86Size.S_32;
  if (n.endsWith("X") || ["SP", "BP", "DI", "SI"].includes(n))
    return X86Size.S_16;
  return X86Size.S_8;
}

export function encodeReg(name: string): number {
  switch (name.toUpperCase()) {
    case "AL":
      return 0;
    case "CL":
      return 1;
    case "DL":
      return 2;
    case "BL":
      return 3;
    case "AH":
      return 4;
    case "CH":
      return 5;
    case "DH":
      return 6;
    case "BH":
      return 7;

    case "AX":
      return 0;
    case "CX":
      return 1;
    case "DX":
      return 2;
    case "BX":
      return 3;
    case "SP":
      return 4;
    case "BP":
      return 5;
    case "SI":
      return 6;
    case "DI":
      return 7;

    case "EAX":
      return 0;
    case "ECX":
      return 1;
    case "EDX":
      return 2;
    case "EBX":
      return 3;
    case "ESP":
      return 4;
    case "EBP":
      return 5;
    case "ESI":
      return 6;
    case "EDI":
      return 7;

    default: {
      console.log(`ENCODE REG: impossible ${name}`);
      return -1;
    }
  }
}

function makeDisp(disp: number | undefined): {
  mode: Mode;
  disp?: EncodingElement;
} {
  if (disp !== undefined) {
    if (-128 < disp && disp < 127) {
      return { mode: "MEMORY_DISP8", disp: { t: "Disp8", value: disp } };
    } else {
      return { mode: "MEMORY_DISP32", disp: { t: "Disp32", value: disp } };
    }
  }
  return { mode: "MEMORY" };
}

function encodeReq(element: EncodingElement, context: EncodingContext) {
  context.elements.push(element);
}

function encodeOpt(
  elementOpt: EncodingElement | undefined,
  context: EncodingContext
) {
  if (elementOpt !== undefined) {
    context.elements.push(elementOpt);
  }
}

export function encodeScale(scale: Scale): number {
  switch (scale) {
    case 1:
      return 0;
    case 2:
      return 1;
    case 4:
      return 2;
    default:
      return 3;
  }
}

export function encodeMode(mode: Mode) {
  switch (mode) {
    case "MEMORY":
      return 0;
    case "MEMORY_DISP8":
      return 1;
    case "MEMORY_DISP32":
      return 2;
    case "REG":
      return 3;
  }
}
