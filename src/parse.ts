import { type Error } from "./api";
import { Lexer, type Token } from "./lexer";
import type { AstInstr, AstOperand, MemoryOperand } from "./syntax";
import { X86Size } from "./x86";

export interface ParseResult {
  instr?: AstInstr;
  errors: Error[];
}

export function parse(content: string, is32bits: boolean): ParseResult {
  const parser = new Parser(is32bits, content);
  const instr = parser.parseAssembly();
  return { instr, errors: parser.errors };
}

type Result<a> = { k: "OK"; c: a } | { k: "NOK" };

type EffectiveAddress =
  | { type: "EARegister"; register: string; scale?: string }
  | { type: "EADisplacement"; sign: boolean; disp: string };

class Parser {
  private lexer: Lexer;
  private current: Token;
  errors: Error[] = [];
  private size: X86Size;

  constructor(is32bits: boolean, content: string) {
    this.lexer = new Lexer(content);
    this.current = this.lexer.nextToken();
    this.size = is32bits ? X86Size.S_32 : X86Size.S_16;
  }

  parseAssembly(): AstInstr | undefined {
    const instrName = this.parseIdent();
    if (instrName.k == "OK") {
      const operands = this.parseOperands();
      return { name: instrName.c.toUpperCase(), operands };
    } else {
      return undefined;
    }
  }

  parseOperands(): AstOperand[] {
    const operands: AstOperand[] = [];
    while (true) {
      if (this.current.kind === "EOF") {
        break;
      }
      const x = this.parseOperand();
      if (x.k === "OK") {
        operands.push(x.c);
        if (this.current.kind === "COMA") {
          this.advance();
        }
      } else {
        break;
      }
    }
    return operands;
  }

  parseOperand(): Result<AstOperand> {
    if (this.current.kind === "IDENT") {
      const name = this.current.value.toUpperCase();
      this.advance();
      if (name === "BYTEPTR") {
        return this.parseMemory(X86Size.S_8);
      } else if (name === "WORDPTR") {
        return this.parseMemory(X86Size.S_16);
      } else {
        return { k: "OK", c: { kind: "Register", name } };
      }
    } else if (this.current.kind === "INTEGER") {
      const value = this.current.value;
      this.advance();
      return {
        k: "OK",
        c: { kind: "Immediate", value: this.immValue(value) ?? 0 },
      };
    } else if (this.current.kind === "LBRT") {
      return this.parseMemory(this.size);
    }
    this.errorExpecting("IDENT, INTEGER or [");
    return { k: "NOK" };
  }

  parseMemory(size: X86Size): Result<AstOperand> {
    if (this.current.kind !== "LBRT") {
      this.errorExpecting("LBRT");
    }
    this.advance();
    const x = this.parseEffectiveAddress();
    if (x.k === "OK") {
      return {
        k: "OK",
        c: {
          kind: "EffectiveAddress",
          address: this.makeMemoryOperand(x.c, size),
        },
      };
    }
    return { k: "NOK" };
  }

  parseEffectiveAddress(): Result<EffectiveAddress[]> {
    const elements: EffectiveAddress[] = [];
    let sign = true;
    while (true) {
      const x = this.parseEAElement(sign);
      if (x.k === "OK") {
        elements.push(x.c);
        if (this.current.kind === "ADD") {
          this.advance();
          sign = true;
        } else if (this.current.kind === "SUB") {
          sign = false;
        } else if (this.current.kind === "RBRT") {
          this.advance();
          return { k: "OK", c: elements };
        } else {
          return { k: "OK", c: elements };
        }
      } else {
        return { k: "OK", c: elements };
      }
    }
  }

  parseEAElement(sign: boolean): Result<EffectiveAddress> {
    if (this.current.kind === "IDENT") {
      const name = this.current.value.toUpperCase();
      this.advance();
      const x = this.parseScale();
      if (x.k === "OK") {
        return {
          k: "OK",
          c: { type: "EARegister", register: name, scale: x.c },
        };
      } else {
        return { k: "NOK" };
      }
    } else if (this.current.kind === "INTEGER") {
      const value = this.current.value;
      this.advance();
      return {
        k: "OK",
        c: { type: "EADisplacement", sign: sign, disp: value },
      };
    }
    this.errorExpecting("IDENT or INTEGER");
    return { k: "NOK" };
  }

  parseScale(): Result<string | undefined> {
    if (this.current.kind === "MUL") {
      this.advance();
      const x = this.parseInteger();
      if (x.k === "OK") {
        return { k: "OK", c: x.c };
      } else {
        return { k: "NOK" };
      }
    }
    return { k: "OK", c: undefined };
  }

  makeMemoryOperand(
    elements: EffectiveAddress[],
    size: X86Size
  ): MemoryOperand {
    let memory: MemoryOperand = {
      size: size,
      base: undefined,
      index: undefined,
      displacement: 0,
    };
    elements.forEach((element) => {
      memory = this.analyzeMemoryOperand(element, memory);
    });
    return memory;
  }

  analyzeMemoryOperand(
    element: EffectiveAddress,
    memory: MemoryOperand
  ): MemoryOperand {
    if (element.type === "EARegister" && element.scale === undefined) {
      if (memory.base) {
        return { ...memory, index: { register: element.register, scale: 1 } };
      }
      return { ...memory, base: element.register };
    } else if (element.type === "EARegister" && element.scale !== undefined) {
      const s = this.scaleOf(element.scale);
      if (!memory.base && s === 1) {
        return { ...memory, base: element.register };
      }
      return { ...memory, index: { register: element.register, scale: s } };
    } else if (element.type === "EADisplacement") {
      const s = this.immValue(element.disp);
      if (s === undefined) {
        return memory;
      }
      return {
        ...memory,
        displacement: memory.displacement + (element.sign ? s : -s),
      };
    }
    throw "impossible";
  }

  scaleOf(value: string): 1 | 2 | 4 | 8 {
    const x = parseInt(value);
    if (x === 1 || x === 2 || x === 4 || x === 8) return x;
    console.log(`BAD SCALE ${x}`);
    return 1;
  }

  immValue(value: string): number | undefined {
    if (value.toUpperCase().endsWith("H")) {
      return parseInt(value.slice(0, value.length - 1), 16);
    } else {
      return parseInt(value);
    }
  }

  parseIdent(): Result<string> {
    if (this.current.kind === "IDENT") {
      const value = this.current.value;
      this.advance();
      return { k: "OK", c: value };
    } else {
      this.errorExpecting("IDENT");
      return { k: "NOK" };
    }
  }

  parseInteger(): Result<string> {
    if (this.current.kind === "INTEGER") {
      const value = this.current.value;
      this.advance();
      return { k: "OK", c: value };
    } else {
      this.errorExpecting("INTEGER");
      return { k: "NOK" };
    }
  }

  addError(msg: string) {
    this.errors.push({ msg });
  }

  errorExpecting(ident: string) {
    this.addError("expecting " + ident);
  }

  advance() {
    this.current = this.lexer.nextToken();
    this.skipErrors();
  }

  skipErrors() {
    while (this.current.kind === "ERROR") {
      this.addError(`unexpected char '${this.current.msg}'`);
      this.advance();
    }
  }
}
