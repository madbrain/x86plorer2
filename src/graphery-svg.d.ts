
declare module "@graphery/svg" {

    export interface Stylable<T> {
        fill(value: string): T
        stroke_width(value: number): T
        stroke(value: string): T
    }

    export type ShapeType = "g" | "rect" | "text" | "path" | "polyline"

    export interface Container {
        add<T extends ShapeType>(shape: T): ShapeBuilder<T>
    }

    export interface Element {
        remove();
    }

    export interface GBuilder extends Container, Element {
        transform(value: string): GBuilder
    }
    
    export interface RectBuilder extends Stylable<RectBuilder>, Element {
        x(value: number): RectBuilder
        y(value: number): RectBuilder
        width(value: number): RectBuilder
        height(value: number): RectBuilder
    }

    export interface PathBuilder extends Stylable<PathBuilder>, Element {
        d(value: string): PathBuilder
    }

    export interface PolylineBuilder extends Stylable<PolylineBuilder>, Element {
        points(points: [number,number][]): PathBuilder
    }
    
    export interface TextBuilder extends Element {
        text_anchor(value: "middle"): TextBuilder
        dx(value: number): TextBuilder
        dy(value: number): TextBuilder
        style: StyleBuilder<TextBuilder>
        content(value: string): TextBuilder
    }

    export interface StyleBuilder<T> {
        fontSize(value: string): T
    }

    export type ShapeBuilder<T extends ShapeType> = T extends "rect" ? RectBuilder
        : T extends "g" ? GBuilder
        : T extends "text" ? TextBuilder
        : T extends "path" ? PathBuilder
        : T extends "polyline" ? PolylineBuilder
        : never

    export interface PySVG extends Container {
        width(value: string | number): PySVG
        height(value: string | number): PySVG
        attachTo(container: HTMLElement): void
    }

    declare const pySVG: () => PySVG;

    export default pySVG;
}