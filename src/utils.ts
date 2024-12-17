
export function groupBy<T>(elements: T[], func: (a: T) => string): Record<string, T[]> {
    const result: Record<string, T[]> = {}
    elements.forEach(e => {
        const k = func(e)
        let l = result[k]
        if (!l) {
            l = []
            result[k] = l
        }
        l.push(e)
    })
    return result
}