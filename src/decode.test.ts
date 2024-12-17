import { expect, test } from "vitest";
import { decodeFromBytes } from "./decode";
import simpleContent from "./code-simple";
import { encodingSize } from "./encode";
import { parse } from "./parse";
import { search } from "./search";

/*
54:	b9 f8 00 00 08       	mov    $0x80000f8,%ecx
  59:	ba 0a 00 00 00       	mov    $0xa,%edx
  5e:	bb 00 00 00 00       	mov    $0x0,%ebx
  63:	b8 03 00 00 00       	mov    $0x3,%eax
  68:	cd 80                	int    $0x80
  6a:	bb 00 00 00 00       	mov    $0x0,%ebx
  6f:	bf 0a 00 00 00       	mov    $0xa,%edi
  74:	b9 f8 00 00 08       	mov    $0x80000f8,%ecx
  79:	85 c0                	test   %eax,%eax
  7b:	0f 84 17 00 00 00    	je     0x98
  81:	0f b6 11             	movzbl (%ecx),%edx
  84:	81 ea 30 00 00 00    	sub    $0x30,%edx
  8a:	0f af df             	imul   %edi,%ebx
  8d:	03 da                	add    %edx,%ebx
  8f:	ff c8                	dec    %eax
  91:	ff c1                	inc    %ecx
  93:	e9 e1 ff ff ff       	jmp    0x79
  98:	b8 01 00 00 00       	mov    $0x1,%eax
  9d:	85 db                	test   %ebx,%ebx
  9f:	0f 84 0a 00 00 00    	je     0xaf
  a5:	0f af c3             	imul   %ebx,%eax
  a8:	ff cb                	dec    %ebx
  aa:	e9 ee ff ff ff       	jmp    0x9d
  af:	b9 01 01 00 08       	mov    $0x8000101,%ecx
  b4:	c6 01 0a             	movb   $0xa,(%ecx)
  b7:	bb 01 00 00 00       	mov    $0x1,%ebx
  bc:	85 c0                	test   %eax,%eax
  be:	0f 84 18 00 00 00    	je     0xdc
  c4:	ba 00 00 00 00       	mov    $0x0,%edx
  c9:	f7 f7                	div    %edi
  cb:	81 c2 30 00 00 00    	add    $0x30,%edx
  d1:	ff c9                	dec    %ecx
  d3:	88 11                	mov    %dl,(%ecx)
  d5:	ff c3                	inc    %ebx
  d7:	e9 e0 ff ff ff       	jmp    0xbc
  dc:	8b c9                	mov    %ecx,%ecx
  de:	8b d3                	mov    %ebx,%edx
  e0:	bb 01 00 00 00       	mov    $0x1,%ebx
  e5:	b8 04 00 00 00       	mov    $0x4,%eax
  ea:	cd 80                	int    $0x80
  ec:	bb 01 00 00 00       	mov    $0x1,%ebx
  f1:	b8 01 00 00 00       	mov    $0x1,%eax
  f6:	cd 80                	int    $0x80
*/

test("decode simple", () => {
  testDecode(simpleContent);
});

function testDecode(bytes: number[]) {
  const is32bits = true;

  while (bytes.length > 0) {
    const result = decodeFromBytes(is32bits, bytes);

    expect(result.errors).toEqual([]);
    expect(result.instructions).toHaveLength(1);
    const inst = result.instructions[0];
    const instrString = inst.name.substring(0, inst.name.indexOf("(") - 2);
    const instrEncoding = inst.name.substring(
      inst.name.indexOf("(") + 1,
      inst.name.length - 1
    );
    console.log(instrString, "|" + instrEncoding + "|");
    let { instr, errors } = parse(instrString, is32bits);
    expect(errors).toHaveLength(0);
    const instrs = search(instr!, is32bits);
    const matching = instrs.find((i) => i.name === instrEncoding);
    expect(matching?.encoding).toEqual(inst.encoding); // TODO compare
    const size = encodingSize(result.instructions[0].encoding!);
    bytes = bytes.slice(size);
  }
}
