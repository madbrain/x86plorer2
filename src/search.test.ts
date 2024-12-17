import { expect, test } from "vitest";
import { parse } from "./parse";
import { search, type SearchResult } from "./search";

function run(content: string, is32bits: boolean) {
  const result = parse(content, is32bits);
  expect(result.instr).toBeDefined();
  return search(result.instr!, is32bits);
}

test("search simple instruction", () => {
  const searchResults = run("mov eax,10", true);
  expect(searchResults).toHaveLength(2);
  expect(searchResults).toEqual([
    {
      name: "MOV r16/32,imm16/32",
      encoding: [{ t: "OpcodeAndReg", opcode: 23, register: 0 }],
    },
    {
      name: "MOV r/m16/32,imm16/32",
      encoding: [
        { t: "Opcode", value: 199 },
        { t: "ModRM", mode: "REG", reg: 0, rm: 0 },
      ],
    },
  ] satisfies SearchResult[]);
});

test("search complex instruction", () => {
  const searchResults = run("mov wordptr [esi+eax*4+100h],1234h", true);
  expect(searchResults).toHaveLength(1);
  expect(searchResults[0]).toEqual({
    name: "MOV r/m16/32,imm16/32",
    encoding: [
      { t: "Opcode", value: 199 },
      { t: "ModRM", mode: "MEMORY_DISP32", reg: 0, rm: 4 },
      { t: "Sib", index: 0, reg: 6, scale: 4 },
      { t: "Disp32", value: 0x100 },
    ],
  } satisfies SearchResult);
});
