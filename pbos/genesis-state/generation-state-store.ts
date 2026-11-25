/** A read and its generation come from the same object response. */
export interface GenerationObject {
    read(): { bytes: string; generation: string };
    replace(generation: string, bytes: string): void;
}

export class GenerationStateStore<T> {
    constructor(private readonly object: GenerationObject, private readonly validate: (state: T) => void) {}

    read(): T {
        return this.parse(this.object.read().bytes);
    }

    update(change: (state: T) => T): T {
        const snapshot = this.object.read();
        const next = change(this.parse(snapshot.bytes));
        this.validate(next);
        this.object.replace(snapshot.generation, JSON.stringify(next) + "\n");
        return next;
    }

    private parse(bytes: string): T {
        const state: T = JSON.parse(bytes);
        this.validate(state);
        return state;
    }
}
