export type Token =
  | { kind: "EOF" }
  | { kind: "COMA" }
  | { kind: "RBRT" }
  | { kind: "LBRT" }
  | { kind: "MUL" }
  | { kind: "SUB" }
  | { kind: "ADD" }
  | { kind: "ERROR"; msg: string }
  | { kind: "INTEGER"; value: string }
  | { kind: "IDENT"; value: string };

export class Lexer {
  private position = 0;
  constructor(private content: string) {}

  nextToken(): Token {
    while (true) {
      const c = this.getChar();
      if (c === undefined) {
        return { kind: "EOF" };
      }
      if (this.isSpace(c)) {
        continue;
      }
      if (this.isLetter(c)) {
        return this.scanIdent(c);
      }
      if (this.isDigit(c)) {
        return this.scanInteger(c);
      }
      if (c === ",") {
        return { kind: "COMA" };
      }
      if (c === "[") {
        return { kind: "LBRT" };
      }
      if (c === "]") {
        return { kind: "RBRT" };
      }
      if (c === "+") {
        return { kind: "ADD" };
      }
      if (c === "-") {
        return { kind: "SUB" };
      }
      if (c === "*") {
        return { kind: "MUL" };
      }
      return { kind: "ERROR", msg: c };
    }
  }

  private getChar(): string | undefined {
    if (this.position >= this.content.length) {
      return undefined;
    }
    return this.content.charAt(this.position++);
  }

  private pushBack() {
    this.position--;
  }

  private isSpace(c: string) {
    return c == " " || c == "\t" || c == "\n";
  }

  private isLetter(c: string) {
    return (c >= "a" && c <= "z") || (c >= "A" && c <= "Z");
  }

  private isDigit(c: string) {
    return c >= "0" && c <= "9";
  }

  private isHexDigit(c: string) {
    return this.isDigit(c) || (c >= "a" && c <= "f") || (c >= "A" && c <= "F");
  }

  private isLetterOrDigit(c: string) {
    return this.isLetter(c) || this.isDigit(c);
  }

  private scanIdent(content: string): Token {
    let buffer = content;
    while (true) {
      const c = this.getChar();
      if (c === undefined) {
        break;
      }
      if (this.isLetterOrDigit(c)) {
        buffer += c;
      } else {
        this.pushBack();
        break;
      }
    }
    return { kind: "IDENT", value: buffer };
  }

  private scanInteger(content: string): Token {
    let buffer = content;
    while (true) {
      const c = this.getChar();
      if (c === undefined) {
        break;
      }
      if (this.isHexDigit(c) || c === "h" || c === "b") {
        buffer += c;
      } else {
        this.pushBack();
        break;
      }
    }
    return { kind: "INTEGER", value: buffer };
  }
}
