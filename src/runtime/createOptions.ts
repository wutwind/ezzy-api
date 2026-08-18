type Mutable<T> = {
    -readonly [K in keyof T]: T[K];
};

export type OptionsBuilder<T extends object> = (options: Mutable<T>) => void;

/** Builds an options object while preserving the absence of optional properties. */
export function createOptions<T extends object>(base: T, ...builders: readonly OptionsBuilder<T>[]): T {
    for (const build of builders) {
        build(base);
    }
    return base;
}
