<script lang="ts">
    let { leftLabel, rightLabel, value = $bindable(true) } = $props();
</script>

<div class="switch-component">
    <span class:off={value} class:on={!value}>{leftLabel} </span>
    <label class="switch">
        <input type="checkbox" bind:checked={value} />
        <span class="slider round"></span>
    </label>
    <span class:on={value} class:off={!value}> {rightLabel}</span>
</div>

<style>
    .switch-component {
        display: inline-block;
    }

    .switch {
        position: relative;
        display: inline-block;
        width: 54px;
        height: 28px;
        bottom: -6px;
    }

    .switch input {
        display: none;
    }

    .slider {
        position: absolute;
        cursor: pointer;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background-color: #2196f3;
        -webkit-transition: 0.4s;
        transition: 0.4s;
    }

    .slider:before {
        position: absolute;
        content: "";
        height: 22px;
        width: 22px;
        left: 3px;
        bottom: 3px;
        background-color: white;
        -webkit-transition: 0.4s;
        transition: 0.4s;
    }

    input:focus + .slider {
        box-shadow: 0 0 1px #2196f3;
    }

    input:checked + .slider:before {
        -webkit-transform: translateX(26px);
        -ms-transform: translateX(26px);
        transform: translateX(26px);
    }

    .slider.round {
        border-radius: 34px;
    }

    .slider.round:before {
        border-radius: 50%;
    }

    .on {
        color: black;
    }

    .off {
        color: #aaa;
    }
</style>
