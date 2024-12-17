import { encode, type EncodingElement } from "./encode";
import type { AstInstr, AstOperand, MemoryOperand } from "./syntax";
import {
  instrToString,
  instructionsByName,
  regName,
  X86Size,
  type Operand,
  type Register,
} from "./x86";

export interface SearchResult {
  name: string;
  encoding: EncodingElement[] | undefined;
}

export function search(instr: AstInstr, is32bits: boolean): SearchResult[] {
  const compare: (a: string, b: string) => boolean =
    instr.operands.length > 0 ? (a, b) => a === b : (a, b) => a.startsWith(b);
  const keys = Object.keys(instructionsByName).filter((name) =>
    compare(name, instr.name)
  );
  const instrDefs = keys.flatMap((k) =>
    (instructionsByName[k] ?? []).filter(({ operands }) =>
      matchOperands(instr.operands, operands)
    )
  );
  return instrDefs.map((inst) => {
    return {
      name: instrToString(inst),
      encoding: encode(is32bits, inst, instr.operands),
    };
  });
}

function matchOperands(operands: AstOperand[], templates: Operand[]): boolean {
  for (let i = 0; i < operands.length; ++i) {
    if (templates.length > i) {
      if (!matchOperand(operands[i], templates[i])) {
        return false;
      }
    } else {
      return true;
    }
  }
  return true;
}

function matchOperand(op: AstOperand, tpl: Operand): boolean {
  if (op.kind === "Register") return matchReg(op.name, tpl);
  if (op.kind === "Immediate") return matchImm(op.value, tpl);
  if (op.kind === "EffectiveAddress") return matchMemory(op.address, tpl);
  throw Error("impossible");
}

function matchReg(reg: string, tpl: Operand): boolean {
  const rs = regSize(reg);
  if (rs === undefined) return true;
  if (tpl.t === "Register") return matchRegName(reg, tpl.size, tpl.name);
  if (tpl.t === "R") return matchSize(tpl.size, rs);
  if (tpl.t === "RM") return matchSize(tpl.size, rs);
  return false;
}

function matchRegName(reg: string, size: X86Size, r: Register): boolean {
  let regs = size == X86Size.S_16_32 ? [X86Size.S_16, X86Size.S_32] : [size];
  return regs.map((s) => regName(s, r)).some((s) => s.startsWith(reg));
}

function matchSize(s: X86Size, size: X86Size): boolean {
  if (size === X86Size.S_32) return s === X86Size.S_32 || s === X86Size.S_16_32;
  if (size === X86Size.S_16) return s === X86Size.S_16 || s === X86Size.S_16_32;
  if (size === X86Size.S_8) return s === X86Size.S_8;
  return false;
}

function matchImm(value: number, tpl: Operand): boolean {
  if (tpl.t === "I") {
    return (
      tpl.size == X86Size.S_32 ||
      tpl.size == X86Size.S_16_32 ||
      value < 1 << getSize(tpl.size)
    );
  }
  if (tpl.t === "REL") {
    return true;
  }
  return false;
}

function getSize(size: X86Size): number {
  if (size === X86Size.S_8) return 8;
  if (size === X86Size.S_16) return 16;
  if (size === X86Size.S_32) return 32;
  if (size === X86Size.S_16_32) return 32;
  throw Error("Impossible");
}

function matchMemory(memory: MemoryOperand, tpl: Operand): boolean {
  if (tpl.t === "RM") return matchSize(tpl.size, memory.size);
  return false;
}

function regSize(reg: string): X86Size | undefined {
  if (reg.startsWith("E")) {
    return X86Size.S_32;
  }
  if (reg.endsWith("X")) {
    return X86Size.S_16;
  }
  if (reg.endsWith("H") || reg.endsWith("L")) {
    return X86Size.S_8;
  }
  return undefined;
}
