
import { MountPointSpec, MountAttr } from '../MountPoint'
import { getTableMount } from './table'
import { Table } from '../Table'
import { Task } from '../Step'
import { runCommandLineProcess } from '../node/CommandLineApp'
import { parseHandler } from '../Handler'

interface Config {
    mountAs: string
}

export function getTaskQueueMount(config: Config): MountPointSpec[] {

    let mountAsAttrs: { [attr:string]: MountAttr } = {};

    if (config.mountAs) {
        const mountAs = parseHandler(config.mountAs);
        for (const tag of mountAs.tags) {
            mountAsAttrs[tag.attr] = tag;
        }
    }

    const workers = new Table({
        attrs: {
            worker_id: { generate: true },
        }
    });

    const tasks = new Table({
        attrs: {
            task_id: { generate: true },
            status: {},
            task_query: { required: false },
            in_progress_worker_id: { required: false },
        },
        funcs: [
            '->',
            'task_id -> ',
        ]
    });

    const workersMount = getTableMount(workers);
    const tasksMount = getTableMount(tasks, { mountAs: 'tasks' });

    const newWorker: MountPointSpec = {
        attrs: {
            new_worker: {}
        }
    };

    const grabNext: MountPointSpec = {
        attrs: {
            'grab_next!': { required: true },
            worker_id: { required: true, requiresValue: true },
            task_query: {},
        },
        async run(step: Task) {
            const worker_id = step.get('worker_id');

            const task = (await step.query(config.mountAs + ' tasks task_id status task_query '+
                `| where status=ready`)).one();

            if (!task) {
                return null;
            }

            await step.query(config.mountAs + ' tasks $task_id '+
                            '| update status=in_progress $in_progress_worker_id',
                             { task_id: task.task_id, in_progress_worker_id: worker_id });

            return {
                ...task,
                worker_id,
            }
        }
    };

    const completeTask: MountPointSpec = {
        attrs: {
            'complete!': { required: true },
            task_id: { required: true },
            task_result: {},
        },
        async run(step: Task) {
            const task_id = step.get('task_id');
            // console.log('complete task running')
            const task = (await step.query(config.mountAs + ' tasks $task_id status', { task_id })).one();

            if (!task)
                throw new Error("task not found")

            if (task.status !== 'in_progress')
                throw new Error("task is not in status: in_progress")

            return await step.query(config.mountAs + ' tasks $task_id '+
                            '| update status=done', { task_id });
        },
    };

    const points: MountPointSpec[] = [
        ...workersMount,
        ...tasksMount,
        newWorker,
        grabNext,
        completeTask,
    ];

    for (const [attr,config] of Object.entries(mountAsAttrs))
        for (const point of points) {
            point.attrs[attr] = config;
        }

    return points;
}

if (require.main === module) {
    runCommandLineProcess({
        setupGraph(graph) {
            graph.mount(getTaskQueueMount({
                mountAs: 'task_test',
            }));

            graph.query('task_test tasks put! status=ready');
        }
    });
}
