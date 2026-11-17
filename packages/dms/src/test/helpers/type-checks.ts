/**
 * `true` when a value of type `Value` may be passed where `Target` is
 * expected, `false` otherwise. A type test assigns the answer it expects, so
 * the test stops compiling when a published type starts accepting a value it
 * rejects, or rejecting one it accepts.
 */
export type IsAssignable<Value, Target> = [Value] extends [Target]
  ? true
  : false;
