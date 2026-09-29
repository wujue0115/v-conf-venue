<script setup lang="ts">
/** A checkbox that can also show a partial (indeterminate) state for a group of children */
defineProps<{
  state: 'on' | 'off' | 'some'
  label: string
}>()
defineEmits<{ toggle: [] }>()
</script>

<template>
  <input
    class="tri"
    type="checkbox"
    :checked="state === 'on'"
    :indeterminate="state === 'some'"
    :aria-label="label"
    @change="$emit('toggle')"
  />
</template>

<style scoped>
.tri {
  flex: none;
  appearance: none;
  width: 16px;
  height: 16px;
  margin: 0;
  display: grid;
  place-items: center;
  border: 1.5px solid #c9c3b6;
  border-radius: 4px;
  background: #fff;
  cursor: pointer;
  transition:
    background 0.15s,
    border-color 0.15s;
}
.tri:hover {
  border-color: var(--ink);
}
.tri:checked,
.tri:indeterminate {
  border-color: var(--yel);
  background: var(--yel);
}
/* a tick when checked, a bar when only some of the group is */
.tri::after {
  content: '';
  display: block;
}
.tri:checked::after {
  width: 4px;
  height: 8px;
  margin-top: -2px;
  border: solid var(--ink);
  border-width: 0 2px 2px 0;
  transform: rotate(45deg);
}
.tri:indeterminate::after {
  width: 8px;
  height: 2px;
  border-radius: 1px;
  background: var(--ink);
}
.tri:focus-visible {
  outline: 2px solid var(--yel);
  outline-offset: 2px;
}
</style>
