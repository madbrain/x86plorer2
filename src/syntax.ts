import { X86Size } from "./x86";

export type AstInstr = { name: string; operands: AstOperand[] };

export type AstOperand =
  | { kind: "Register"; name: string }
  | { kind: "Immediate"; value: number }
  | { kind: "EffectiveAddress"; address: MemoryOperand };

export type MemoryOperand = {
  size: X86Size;
  base?: string;
  index?: { register: string; scale: 1 | 2 | 4 | 8 };
  displacement: number;
};

export function toString(instr: AstInstr) {
  return `${instr.name} ${instr.operands.map((o) => operandString(o)).join(", ")}`;
}

function operandString(operand: AstOperand) {
  switch (operand.kind) {
    case "Register":
      return operand.name;
    case "Immediate":
      return toDisplayInt(operand.value);
    case "EffectiveAddress":
      return memoryString(operand.address);
  }
}

function memoryString(memory: MemoryOperand) {
  const size =
    memory.size === X86Size.S_16
      ? "WORDPTR "
      : memory.size === X86Size.S_8
        ? "BYTEPTR "
        : "";
  return `${size}[${memoryOperand(memory)}]`;
}

function memoryOperand(memory: MemoryOperand): string {
  const base = memory.base;
  const index = memory.index
    ? `${memory.index.register}*${memory.index.scale}`
    : undefined;
  let disp =
    memory.displacement !== 0 ? toDisplayInt(memory.displacement) : undefined;
  return [base, index, disp]
    .filter((x) => x !== undefined)
    .reduce((res, x, i) => res + (x[0] === "-" || i === 0 ? x : "+" + x), "");
}

export function toDisplayInt(value: number): string {
  return value < 1000 ? value.toString() : value.toString(16) + "h";
}
