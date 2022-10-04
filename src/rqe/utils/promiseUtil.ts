
export function timedOut(p: Promise<any>, ms: number): Promise<boolean> {
    return new Promise(resolve => {

        p.then(() => resolve(false)).catch(() => resolve(false));

        const timer = new Promise(resolve => setTimeout(resolve, ms));

        timer.then(() => resolve(true));
    });
}
