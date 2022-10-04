
import { Task } from '../Step'

function roundNumberStr(n: number, sigfigs: number) {
    let s = ''+n;

    let dot = s.indexOf('.');
    if (dot == -1)
        return s;

    return s.slice(0, dot + 1 + sigfigs);
}

function run(step: Task) {
    let totalCount = 0;
    let countInThisBucket = 0;
    let startedBucketAt = Date.now();

    const { every_count } = step.args();
    const messageEveryCount = every_count ? parseInt(every_count) : 1000;

    step.input.sendTo({
        receive(msg) {

            // console.log('rate saw', msg);

            switch (msg.t) {
                case 'item':
                    totalCount++;
                    countInThisBucket++

                    // console.log({ totalCount, countInThisBucket, messageEveryCount })

                    if ((totalCount % messageEveryCount) === 0) {


                        const now = Date.now();
                        const elapsedSec = (now - startedBucketAt) / messageEveryCount;

                        let rate;

                        if (elapsedSec === 0) {
                            rate = '(instant)'
                        } else {
                            rate = `${roundNumberStr(countInThisBucket / elapsedSec, 2)} per second`;
                        }

                        // console.log('rate saw', { totalCount, rate });

                        step.put({ count: totalCount, rate });

                        startedBucketAt = now;
                        countInThisBucket = 0;
                    }

                    break;
                default:
                    step.output.receive(msg);
            }
        }
    });
}

export const rate = {
    run,
}

