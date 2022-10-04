
export const need = {
    // this verb is resolved and removed during planning.

    run(task) {
        task.output.done();
    },
    name: 'need',
}
