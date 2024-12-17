<script lang="ts">
    import { type EncodingElement } from "./encode";
    import { EncodingViewer } from "./viewer";
    import { toDiagram } from "./encode-diagram";
    import { onMount } from "svelte";

    export let encoding: EncodingElement[] = [];
    let container: HTMLDivElement;
    let viewer: EncodingViewer;
    
    $: display(encoding);

    function display(encoding: EncodingElement[]) {
        if (viewer) {
            viewer.display(toDiagram(encoding))
        }
    }

    onMount(() => {
        viewer = new EncodingViewer(container)
        viewer.display(toDiagram(encoding));
    })
</script>

<div bind:this={container}></div>
