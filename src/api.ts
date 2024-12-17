import type { EncodingElement } from "./encode";

export interface Instruction {
    name: string,
    encoding?: EncodingElement[]
}

export interface Error {
    msg: string;
}

export interface Result {
    errors: Error[]
    instructions: Instruction[]
}
