import { expect, test } from "vitest";
import { parse } from "./parse";
import type { AstInstr } from "./syntax";
import { X86Size } from "./x86";

test("parse simple instruction", () => {
  const result = parse("mov eax,10", true);
  expect(result.errors).toEqual([]);
  expect(result.instr).toEqual({
    name: "MOV",
    operands: [
      { kind: "Register", name: "EAX" },
      { kind: "Immediate", value: 10 },
    ],
  });
});

test("parse complex instruction", () => {
  const result = parse("mov wordptr [esi+eax*4+100h],1234h", true);
  expect(result.errors).toEqual([]);
  expect(result.instr).toEqual({
    name: "MOV",
    operands: [
      {
        kind: "EffectiveAddress",
        address: {
          base: "ESI",
          displacement: 256,
          index: { register: "EAX", scale: 4 },
          size: X86Size.S_16,
        },
      },
      { kind: "Immediate", value: 0x1234 },
    ],
  } satisfies AstInstr);
});
