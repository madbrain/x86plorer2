import {
  encodeMode,
  encodeReg,
  encodeRegister,
  encodeScale,
  type EncodingElement,
  type RegisterValue,
  type RMValue,
} from "./encode";
import { toDisplayInt } from "./syntax";
import type { Diagram, DiagramBlock } from "./viewer";
import { bitSize } from "./x86";

export function toDiagram(elements: EncodingElement[]): Diagram {
  return elements.map((element) => encodeElement(element));
}

function encodeElement(element: EncodingElement): DiagramBlock {
  switch (element.t) {
    case "Prefix":
      return {
        text: bytes([element.value]),
        element: { t: "Leaf", text: "Prefix" },
      };
    case "Opcode":
      return {
        text: bytes([element.value]),
        element: { t: "Leaf", text: "Opcode" },
      };
    case "OpcodeAndReg":
      return encodeIntoByte(opRegEncoding, [element.opcode, element.register]);
    case "ModRM":
      return encodeIntoByte(modRmEncoding, [
        element.mode,
        element.reg,
        element.rm,
      ]);
    case "Sib":
      return encodeIntoByte(sibEncoding, [
        encodeScale(element.scale),
        element.index,
        element.reg,
      ]);
    case "Disp8":
      return {
        text: bytes([element.value]),
        element: {
          t: "Leaf",
          text: "Displacement: " + toDisplayInt(element.value),
        },
      };
    case "Disp32":
      return {
        text: bytes(toLittleEndian(32, element.value)),
        element: {
          t: "Leaf",
          text: "Displacement: " + toDisplayInt(element.value),
        },
      };
    case "Immediate":
      return {
        text: bytes(toLittleEndian(bitSize(element.size), element.value)),
        element: {
          t: "Leaf",
          text: "Immediate value: " + toDisplayInt(element.value),
        },
      };
  }
}

export function toBits(size: number, value: number): string {
  let res = "";
  for (let i = 1; i <= size; ++i) {
    res += ((value >> (size - i)) & 1).toString();
  }
  return res;
}

function toLittleEndian(size: number, value: number) {
  const result = [];
  for (let i = 0; i < size / 8; ++i) {
    result.push((value >> (i * 8)) & 0xff);
  }
  return result;
}

function bytes(values: number[]): string {
  return values.map((v) => toByteHex(v)).join(" ");
}

function toByteHex(value: number): string {
  return (value + 256).toString(16).slice(1, 3);
}

function encodeIntoByte(encoding: EncodingInfo, values: any[]): DiagramBlock {
  const o: DiagramBlock[] = [];
  let e = 0;
  encoding.elements.forEach((el, i) => {
    let v = values[i];
    let name = el.name;
    if (el.encode) {
      name = el.encode.label(v);
      v = el.encode.value(v);
    }
    o.push({ text: toBits(el.size, v), element: { t: "Leaf", text: name } });
    e |= v << el.shift;
  });
  return {
    text: bytes([e]),
    element: { t: "Node", text: encoding.name, element: o },
  };
}

interface EncodingPartInfo {
  name: string;
  size: number;
  shift: number;
  encode?: {
    value: (v: any) => number;
    label: (v: any) => string;
  };
}

interface EncodingInfo {
  name: string;
  elements: EncodingPartInfo[];
}

const opRegEncoding: EncodingInfo = {
  name: "Opcode and Register",
  elements: [
    { name: "Opcode", size: 5, shift: 3 },
    { name: "Reg", size: 3, shift: 0 },
  ],
};

const sibEncoding: EncodingInfo = {
  name: "SIB",
  elements: [
    { name: "Scale", size: 2, shift: 6 },
    { name: "Index", size: 3, shift: 3 },
    { name: "Base", size: 3, shift: 0 },
  ],
};

function encodeRegLabel(r: RegisterValue) {
  if (r.t === "REG") {
    return r.name;
  }
  return `Opcode Ext ${r.value}`;
}

function encodeRMValue(r: RMValue) {
  if (r.t === "REG") {
    return encodeReg(r.name);
  }
  return encodeReg("ESP");
}

function encodeRMLabel(r: RMValue) {
  if (r.t === "REG") {
    return r.name;
  }
  return "SIB";
}

const modRmEncoding: EncodingInfo = {
  name: "ModRM",
  elements: [
    {
      name: "Mode",
      size: 2,
      shift: 6,
      encode: { value: encodeMode, label: (v) => `Mode (${v})` },
    },
    {
      name: "Reg",
      size: 3,
      shift: 3,
      encode: {
        value: (v) => encodeRegister(v),
        label: (v) => `Reg (${encodeRegLabel(v)})`,
      },
    },
    {
      name: "RM",
      size: 3,
      shift: 0,
      encode: {
        value: encodeRMValue,
        label: (v) => `RM (${encodeRMLabel(v)})`,
      },
    },
  ],
};
