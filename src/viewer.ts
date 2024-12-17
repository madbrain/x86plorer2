import gySVG, { type Container, type Element, type PySVG } from "@graphery/svg";

export type Diagram = DiagramBlock[]
export type DiagramBlock = { text: string, element: DiagramElement }
export type DiagramElement = { t: "Node", text: string, element: Diagram } | { t: "Leaf", text: string }

class TextMeasurer {

    context: CanvasRenderingContext2D;

    constructor() {
        const canvas = document.createElement("canvas");
        this.context = canvas.getContext("2d")!;
    }

    measure(text: string, textSize: string) {
        this.context.font = textSize + " arial";
        const metrics = this.context.measureText(text);
        return metrics;
    }
}

// TODO move to geometry
interface Point {
    x: number;
    y: number;
}

interface Rectangle {
    x: number;
    y: number;
    width: number;
    height: number;
}

// TODO make style object
const textSize = "18px"
const textMargin = 5
const textGap = 10
const borderMargin = 10

export class EncodingViewer {
    private svg: PySVG;
    private node: Element | null = null
    private measurer = new TextMeasurer();

    constructor(private container: HTMLDivElement) {
        this.svg = gySVG()
            .width("100%")
            .height("100%");
        this.svg.attachTo(this.container);
    }

    public display(diagram: Diagram) {
        if (this.node) {
            this.node.remove()
        }
        const { height: nodeHeight, node } = this.makeNode(this.svg, diagram, { x: borderMargin, y: borderMargin })
        this.node = node
        this.svg.height(nodeHeight)
    }

    private makeNode(parent: Container, diagram: Diagram, position: Point): { height: number, node: Element } {
        const nodeSvg = parent.add('g')
            .transform(`translate(${position.x}, ${position.y})`);

        const linesSvg = nodeSvg.add('g')

        let y = 0;
        let x = 0;
        const horz: Rectangle[] = []
        const vert: Point[] = []

        diagram.forEach(element => {
            const m = this.measurer.measure(element.text, textSize);
            const ascent = m.actualBoundingBoxAscent;
            const height = m.actualBoundingBoxAscent + m.actualBoundingBoxDescent
            const rectSize = { width: m.width + textMargin*2, height: height + textMargin*2 }

            const gSvg = nodeSvg.add('g')
                .transform(`translate(${x},${y})`);
            gSvg.add('rect')
                .width(rectSize.width)
                .height(rectSize.height)
                .fill("none")
                .stroke_width(2)
                .stroke('rgb(52,101,164)');
            gSvg.add('text')
                .text_anchor("middle")
                .dx(textMargin + m.width/2)
                .dy(textMargin + ascent)
                .style.fontSize(textSize)
                .content(element.text);
            
            horz.push({ x, y, width: rectSize.width, height: rectSize.height })
            x += m.width + textMargin*2 + textGap
        });

        y += horz.reduce((a, b) => Math.max(a, b.height), 0) + 10
        
        for (let i = diagram.length - 1; i >= 0; --i) {
            const element = diagram[i];
            const m = this.measurer.measure(element.element.text, textSize);
            const ascent = m.actualBoundingBoxAscent;
            let height = m.actualBoundingBoxAscent + m.actualBoundingBoxDescent

            const gSvg = nodeSvg.add('g')
                .transform(`translate(${x},${y})`);
            gSvg.add('text')
                .text_anchor("middle")
                .dx(textMargin + m.width/2)
                .dy(textMargin + ascent)
                .style.fontSize(textSize)
                .content(element.element.text);
            
            vert.push({ x, y: y + height / 2 + textMargin});

            if (element.element.t === "Node") {
                const { height: nodeHeight } = this.makeNode(gSvg, element.element.element, { x: m.width + textMargin*2 + textGap, y: 0 })
                height += nodeHeight
            }
            
            y += height + textMargin*2 + textGap
        }

        horz.forEach((r, i) => {
            const dest = vert[vert.length - 1 - i]
            linesSvg.add('polyline')
                .fill("none")
                .stroke_width(3)
                .stroke('rgb(115,210,22)')
                .points( [ [r.x + r.width /2, r.y + r.height ], [r.x + r.width /2, dest.y], [dest.x, dest.y] ])
        })

        return { height: y, node: nodeSvg }
    }
}