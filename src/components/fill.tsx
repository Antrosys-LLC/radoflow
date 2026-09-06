import type { ReactNode } from "react";

import { Latin } from "@/components/latin";

/**
 * A dictionary sentence with its `{placeholders}` filled in.
 *
 * Every value these sentences carry is a name, a count, a date, a time or a
 * money figure, so each one is rendered through `<Latin>`. Substituting with a
 * plain `String.replace` would drop an employee code or a rupee figure into a
 * right-to-left paragraph, where the bidi algorithm is free to reorder it on
 * display — and would also set it in Nastaliq, which is not a Latin face.
 *
 * The template is split rather than replaced because the translations do not
 * keep the English order: `"{online} of {total} online"` is
 * `"{total} میں سے {online} چل رہی ہیں"` in Urdu, with the two slots the other
 * way round. Slots are therefore matched by name, in whatever order the
 * sentence puts them.
 */
export function Fill({
  template,
  values,
}: {
  template: string;
  values: Record<string, ReactNode>;
}) {
  /*
   * The capturing group keeps the placeholder names in the result, so the
   * parts alternate: literal text at even indices, a slot name at odd ones.
   */
  const parts = template.split(/\{(\w+)\}/g);

  return (
    <>
      {parts.map((part, index) =>
        index % 2 === 0 ? part : <Latin key={index}>{values[part]}</Latin>,
      )}
    </>
  );
}
