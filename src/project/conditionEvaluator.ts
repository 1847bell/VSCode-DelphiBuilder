import { expandMsBuildProperties, PropertyBag } from "./propertyResolver";
import { localize } from "../localization/localizer";

type TokenType = "string" | "word" | "eq" | "ne" | "and" | "or" | "lparen" | "rparen" | "eof";

interface Token {
  type: TokenType;
  value: string;
}

export class ConditionSyntaxError extends Error {}

class Lexer {
  private offset = 0;

  public constructor(private readonly input: string) {}

  public next(): Token {
    this.skipWhitespace();
    if (this.offset >= this.input.length) {
      return { type: "eof", value: "" };
    }

    const current = this.input[this.offset];
    if (current === "(") {
      this.offset += 1;
      return { type: "lparen", value: current };
    }
    if (current === ")") {
      this.offset += 1;
      return { type: "rparen", value: current };
    }
    if (this.input.startsWith("==", this.offset)) {
      this.offset += 2;
      return { type: "eq", value: "==" };
    }
    if (this.input.startsWith("!=", this.offset)) {
      this.offset += 2;
      return { type: "ne", value: "!=" };
    }
    if (current === "'" || current === '"') {
      return this.readQuoted(current);
    }
    return this.readWord();
  }

  private skipWhitespace(): void {
    while (/\s/.test(this.input[this.offset] ?? "")) {
      this.offset += 1;
    }
  }

  private readQuoted(quote: string): Token {
    this.offset += 1;
    let value = "";
    while (this.offset < this.input.length) {
      const current = this.input[this.offset];
      if (current === quote) {
        if (this.input[this.offset + 1] === quote) {
          value += quote;
          this.offset += 2;
          continue;
        }
        this.offset += 1;
        return { type: "string", value };
      }
      value += current;
      this.offset += 1;
    }
    throw new ConditionSyntaxError(localize("condition.error.unterminated"));
  }

  private readWord(): Token {
    const start = this.offset;
    while (this.offset < this.input.length && !/[\s()=!]/.test(this.input[this.offset])) {
      this.offset += 1;
    }
    if (start === this.offset) {
      throw new ConditionSyntaxError(localize("condition.error.character", {
        character: this.input[this.offset]
      }));
    }
    const value = this.input.slice(start, this.offset);
    const keyword = value.toLocaleLowerCase();
    if (keyword === "and") {
      return { type: "and", value };
    }
    if (keyword === "or") {
      return { type: "or", value };
    }
    return { type: "word", value };
  }
}

class Parser {
  private current: Token;

  public constructor(private readonly lexer: Lexer) {
    this.current = lexer.next();
  }

  public parse(): boolean {
    const result = this.parseOr();
    if (this.current.type !== "eof") {
      throw new ConditionSyntaxError(localize("condition.error.token", {
        token: this.current.value
      }));
    }
    return result;
  }

  private parseOr(): boolean {
    let result = this.parseAnd();
    while (this.current.type === "or") {
      this.advance();
      const right = this.parseAnd();
      result = result || right;
    }
    return result;
  }

  private parseAnd(): boolean {
    let result = this.parsePrimary();
    while (this.current.type === "and") {
      this.advance();
      const right = this.parsePrimary();
      result = result && right;
    }
    return result;
  }

  private parsePrimary(): boolean {
    if (this.current.type === "lparen") {
      this.advance();
      const result = this.parseOr();
      this.expect("rparen");
      return result;
    }

    const left = this.parseOperand();
    if (this.current.type === "eq" || this.current.type === "ne") {
      const operator = this.current.type;
      this.advance();
      const right = this.parseOperand();
      const equal = left.localeCompare(right, undefined, { sensitivity: "accent" }) === 0;
      return operator === "eq" ? equal : !equal;
    }
    return left !== "" && left.toLocaleLowerCase() !== "false" && left !== "0";
  }

  private parseOperand(): string {
    if (this.current.type !== "string" && this.current.type !== "word") {
      throw new ConditionSyntaxError(localize("condition.error.expectedValue", {
        value: this.current.value
      }));
    }
    const value = this.current.value;
    this.advance();
    return value;
  }

  private expect(type: TokenType): void {
    if (this.current.type !== type) {
      throw new ConditionSyntaxError(localize("condition.error.expected", {
        type,
        value: this.current.value
      }));
    }
    this.advance();
  }

  private advance(): void {
    this.current = this.lexer.next();
  }
}

export function evaluateCondition(condition: string | undefined, properties: PropertyBag): boolean {
  if (!condition?.trim()) {
    return true;
  }
  const expanded = expandMsBuildProperties(condition, properties).value;
  return new Parser(new Lexer(expanded)).parse();
}
