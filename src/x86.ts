import { groupBy } from "./utils";

export enum X86Size {
  S_8 = "8",
  S_16 = "16",
  S_32 = "32",
  S_16_32 = "16/32",
}

export function bitSize(size: X86Size) {
  switch (size) {
    case X86Size.S_8:
      return 8;
    case X86Size.S_16:
      return 16;
    default:
      return 32;
  }
}

export type InstructionDefinition = {
  opcodes: Opcode[];
  name: string;
  operands: Operand[];
};

export type Register = "AX" | "AL" | "DX";

export type Opcode =
  | { t: "O"; value: number }
  | { t: "E"; value: number }
  | { t: "O_R"; value: number }
  | { t: "MODRM" };

export type Operand =
  | { t: "R"; size: X86Size }
  | { t: "Register"; size: X86Size; name: Register }
  | { t: "RM"; size: X86Size }
  | { t: "I"; size: X86Size }
  | { t: "REL"; size: X86Size }
  | { t: "Error" }; // ?

const Instr = (
  opcodes: Opcode[],
  name: string,
  operands: Operand[]
): InstructionDefinition => ({ opcodes, name, operands });
const O = (value: number): Opcode => ({ t: "O", value });
const O_R = (value: number): Opcode => ({ t: "O_R", value: value });
const E = (value: number): Opcode => ({ t: "E", value });
const MODRM: Opcode = { t: "MODRM" };

function ops(operands: string[]) {
  return operands.map(templatePattern);
}

function templatePattern(tpl: string): Operand {
  if (tpl.startsWith("r/m")) {
    const x = templateSize(tpl.slice(3));
    return x ? { t: "RM", size: x } : { t: "Error" };
  } else if (tpl.startsWith("rel")) {
    const x = templateSize(tpl.slice(3));
    return x ? { t: "REL", size: x } : { t: "Error" };
  } else if (tpl.startsWith("r")) {
    const x = templateSize(tpl.slice(1));
    return x ? { t: "R", size: x } : { t: "Error" };
  } else if (tpl.startsWith("imm")) {
    const x = templateSize(tpl.slice(3));
    return x ? { t: "I", size: x } : { t: "Error" };
  } else {
    const x = makeReg(tpl);
    return x ? { t: "Register", name: x.name, size: x.size } : { t: "Error" };
  }
}

function templateSize(s: string): X86Size | undefined {
  if (s === "32") return X86Size.S_32;
  if (s === "16") return X86Size.S_16;
  if (s === "8") return X86Size.S_8;
  if (s === "16/32") return X86Size.S_16_32;
  return undefined;
}

function makeReg(tpl: string): { size: X86Size; name: Register } | undefined {
  if (tpl === "E_AX") return { size: X86Size.S_16_32, name: "AX" };
  if (tpl === "EAX") return { size: X86Size.S_32, name: "AX" };
  if (tpl === "AX") return { size: X86Size.S_16, name: "AX" };
  if (tpl === "AL") return { size: X86Size.S_8, name: "AL" };
  if (tpl === "DX") return { size: X86Size.S_16, name: "DX" };
  return undefined;
}

// Taken from http://www.felixcloutier.com/x86/
// http://www.c-jump.com/CIS77/CPU/x86/lecture.html
export const instructions: InstructionDefinition[] = [
  Instr([O(0x00), MODRM], "ADD", ops(["r/m8", "r8"])),
  Instr([O(0x01), MODRM], "ADD", ops(["r/m16/32", "r16/32"])),
  Instr([O(0x02), MODRM], "ADD", ops(["r8", "r/m8"])),
  Instr([O(0x03), MODRM], "ADD", ops(["r16/32", "r/m16/32"])),
  Instr([O(0x04)], "ADD", ops(["AL", "imm8"])),
  Instr([O(0x05)], "ADD", ops(["E_AX", "imm16/32"])),
  Instr([O(0x80), E(0)], "ADD", ops(["r/m8", "imm8"])),
  Instr([O(0x81), E(0)], "ADD", ops(["r/m16/32", "imm16/32"])),
  Instr([O(0x83), E(0)], "ADD", ops(["r/m16/32", "imm8"])),

  Instr([O(0xfe), E(1)], "DEC", ops(["r/m8"])),
  Instr([O(0xff), E(1)], "DEC", ops(["r/m16/32"])),
  Instr([O_R(0x48)], "DEC", ops(["r16/32"])),

  Instr([O(0xf6), E(6)], "DIV", ops(["r/m8"])),
  Instr([O(0xf7), E(6)], "DIV", ops(["r/m16/32"])),

  Instr([O(0xf4)], "HLT", []),
  Instr([O(0xf), O(1), E(2)], "LGDT", ops(["r/m16/32"])),
  Instr([O(0xf), O(1), E(3)], "LIDT", ops(["r/m16/32"])),

  Instr([O(0xf6), E(7)], "IDIV", ops(["r/m8"])),
  Instr([O(0xf7), E(7)], "IDIV", ops(["r/m16/32"])),

  Instr([O(0xf6), E(5)], "IMUL", ops(["r/m8"])),
  Instr([O(0xf7), E(5)], "IMUL", ops(["r/m16/32"])),
  Instr([O(0x0f), O(0xaf), MODRM], "IMUL", ops(["r16/32", "r/m16/32"])),
  Instr([O(0x6b), MODRM], "IMUL", ops(["r16/32", "r/m16/32", "imm8"])),
  Instr([O(0x69), MODRM], "IMUL", ops(["r16/32", "r/m16/32", "imm16/32"])),

  Instr([O(0xe4)], "IN", ops(["AL", "imm8"])),
  Instr([O(0xe5)], "IN", ops(["E_AX", "imm8"])),
  Instr([O(0xec)], "IN", ops(["AL", "DX"])),
  Instr([O(0xed)], "IN", ops(["E_AX", "DX"])),

  Instr([O(0xfe), E(0)], "INC", ops(["r/m8"])),
  Instr([O(0xff), E(0)], "INC", ops(["r/m16/32"])),
  Instr([O_R(0x40)], "INC", ops(["r16/32"])),

  Instr([O(0xcc)], "INT3", []),
  Instr([O(0xcd)], "INT", ops(["imm8"])),

  Instr([O(0x0f), O(0x84)], "JE", ops(["rel16/32"])),
  Instr([O(0xe9)], "JMP", ops(["rel16/32"])),

  Instr([O(0x8d), MODRM], "LEA", ops(["r16/32", "m"])),

  Instr([O(0x88), MODRM], "MOV", ops(["r/m8", "r8"])),
  Instr([O(0x89), MODRM], "MOV", ops(["r/m16/32", "r16/32"])),
  Instr([O(0x8a), MODRM], "MOV", ops(["r8", "r/m8"])),
  Instr([O(0x8b), MODRM], "MOV", ops(["r16/32", "r/m16/32"])),
  Instr([O(0x8c), MODRM], "MOV", ops(["r/m16", "sreg"])),
  Instr([O(0x8e), MODRM], "MOV", ops(["sreg", "r/m16"])),
  Instr([O(0xa0)], "MOV", ops(["AL", "moffs8"])),
  Instr([O(0xa1)], "MOV", ops(["E_AX", "moffs16/32"])),
  Instr([O(0xa2)], "MOV", ops(["moffs8", "AL"])),
  Instr([O(0xa3)], "MOV", ops(["moffs16/32", "E_AX"])),
  Instr([O_R(0xb0)], "MOV", ops(["r8", "imm8"])),
  Instr([O_R(0xb8)], "MOV", ops(["r16/32", "imm16/32"])),
  Instr([O(0xc6), E(0)], "MOV", ops(["r/m8", "imm8"])),
  Instr([O(0xc7), E(0)], "MOV", ops(["r/m16/32", "imm16/32"])),

  Instr([O(0x0f), O(0xb6), MODRM], "MOVZX", ops(["r16/32", "r/m8"])),
  Instr([O(0x0f), O(0xb7), MODRM], "MOVZX", ops(["r32", "r/m16"])),

  Instr([O(0xf6), E(4)], "MUL", ops(["r/m8"])),
  Instr([O(0xf7), E(4)], "MUL", ops(["r/m16/32"])),

  Instr([O(0x90)], "NOP", []),

  Instr([O(0xe6)], "OUT", ops(["imm8", "AL"])),
  Instr([O(0xe7)], "OUT", ops(["imm8", "E_AX"])),
  Instr([O(0xee)], "OUT", ops(["DX", "AL"])),
  Instr([O(0xef)], "OUT", ops(["DX", "E_AX"])),

  Instr([O_R(0x58)], "POP", ops(["r32"])),
  Instr([O_R(0x50)], "PUSH", ops(["r32"])),

  Instr([O(0xc3)], "RET", []),

  Instr([O(0x2c)], "SUB", ops(["AL", "imm8"])),
  Instr([O(0x2d)], "SUB", ops(["E_AX", "imm16/32"])),

  Instr([O(0x80), E(5)], "SUB", ops(["r/m8", "imm8"])),
  Instr([O(0x81), E(5)], "SUB", ops(["r/m16/32", "imm16/32"])),
  Instr([O(0x83), E(5)], "SUB", ops(["r/m16/32", "imm8"])),

  Instr([O(0x28), MODRM], "SUB", ops(["r/m8", "r8"])),
  Instr([O(0x29), MODRM], "SUB", ops(["r/m16/32", "r16/32"])),

  Instr([O(0x2a), MODRM], "SUB", ops(["r8", "r/m8"])),
  Instr([O(0x2b), MODRM], "SUB", ops(["r16/32", "r/m16/32"])),

  Instr([O(0xa8)], "TEST", ops(["AL", "imm8"])),
  Instr([O(0xa9)], "TEST", ops(["E_AX", "imm16/32"])),
  Instr([O(0xf6), E(0)], "TEST", ops(["r/m8", "imm8"])),
  Instr([O(0xf7), E(0)], "TEST", ops(["r/m16/32", "imm16/32"])),
  Instr([O(0x84), MODRM], "TEST", ops(["r/m8", "r8"])),
  Instr([O(0x85), MODRM], "TEST", ops(["r/m16/32", "r16/32"])),
];

export function instrToString(instr: InstructionDefinition): string {
  return instr.name + " " + instr.operands.map(operandString); // operands |> String.join ", ")
}

function operandString(op: Operand): string {
  if (op.t === "RM") return "r/m" + sizeName(op.size);
  if (op.t === "R") return "r" + sizeName(op.size);
  if (op.t === "I") return "imm" + sizeName(op.size);
  if (op.t === "REL") return "rel" + sizeName(op.size);
  if (op.t === "Register") return regName(op.size, op.name);
  return "<error>";
}

function sizeName(size: X86Size): string {
  if (size === X86Size.S_32) return "32";
  if (size === X86Size.S_16) return "16";
  if (size === X86Size.S_8) return "8";
  if (size === X86Size.S_16_32) return "16/32";
  throw Error("Impossible");
}

export function regName(size: X86Size, reg: Register): string {
  if (reg === "AX") return size === X86Size.S_16 ? "AX" : "EAX";
  if (reg === "AL") return "AL";
  if (reg === "DX") return "DX";
  throw Error("Impossible");
}

export const instructionsByName: { [name: string]: InstructionDefinition[] } =
  groupBy(instructions, (instr) => instr.name);
