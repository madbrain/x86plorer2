<script lang="ts">
  import type { Result } from "./api";
  import EncodingDiagram from "./EncodingDiagram.svelte";
  import Switch from "./lib/Switch.svelte";
  import { parse } from "./parse";
  import { search } from "./search";
  import { decode } from "./decode";

  // let content = $state("MOV ECX, 80000f8h");
  // let is32bits = $state(true);
  // let doDecode = $state(false);

  let content = $state("0f 01 15 d6 00 10 00");
  let is32bits = $state(true);
  let doDecode = $state(true);

  function encodeInstruction(content: string, is32bits: boolean): Result {
    let { instr, errors } = parse(content, is32bits);
    let instructions = instr ? search(instr, is32bits) : [];
    return { errors, instructions };
  }

  function decodeInstruction(content: string, is32bits: boolean): Result {
    return decode(is32bits, content);
  }

  function process() {
    if (doDecode) {
      return decodeInstruction(content, is32bits);
    }
    return encodeInstruction(content, is32bits);
  }

  let result: Result = $derived(process());
</script>

<div id="logo"></div>
<Switch leftLabel="Encode" rightLabel="Decode" bind:value={doDecode} />
<div class="push-right">
  <Switch
    leftLabel="16bits"
    rightLabel="32bits"
    bind:value={is32bits}
  />
</div>
<input placeholder="Assembly" type="text" bind:value={content} />
<div id="errors">
  <ul>
    {#each result.errors as error}
      <li>{error.msg}</li>
    {/each}
  </ul>
</div>
<div id="instructions">
  <ul>
    {#each result.instructions as instruction}
      <li>
        <div class="instruction">
          <span>{instruction.name}</span>
          {#if  instruction.encoding}
          <EncodingDiagram encoding={instruction.encoding} />
          {/if}
        </div>
      </li>
    {/each}
  </ul>
</div>
