
import { Task } from './Step'
import { HandlerCallback, parseHandler, Handler } from './Handler'

const FunctionRegex = /.*?\((.*?)\)/

export function getFunctionParameterNamesFromStr(funcStr: string) {
    const match = FunctionRegex.exec(funcStr);

    let argsStr;

    if (match) {
        argsStr = match[1];
    } else {
        argsStr = funcStr.slice(0, funcStr.indexOf('=>')).trim();
    }

    const args = argsStr.split(',')
        .map(arg => arg.trim())
        .filter(arg => arg !== '');

    return args;
}

export function getFunctionParameterNames(func: Function) {
    return getFunctionParameterNamesFromStr(func.toString());
}

export function magicFunctionNameToSourceCode(argName: string) {
    if (argName === 'task')
        return 'task';
    if (argName === 'step')
        return 'task';
    if (argName === 'query')
        return '(q, p) => task.query(q, p)'
    if (argName === 'item')
        return 'task.args()'
    if (argName === 'graph')
        return 'task.graph'

    return `task.getOptional(${argName}, null)`
}

export function precompileJavascriptMagic(funcStr: string) {
    const args = getFunctionParameterNamesFromStr(funcStr);

    let fetchValueLines = [];

    for (const arg of args) {
        if (arg === 'task')
            continue;
        fetchValueLines.push(`const ${arg} = ${magicFunctionNameToSourceCode(arg)};`);
    }

    return `(task) => {
        const originalHandler = ${funcStr};

        ${fetchValueLines.join('\n        ')}

        return originalHandler(${args.join(', ')})
    }`;
}

export function getHandlerWithJavascriptMagic(func: Function): HandlerCallback {
    const args = getFunctionParameterNames(func);

    return (task: Task) => {
        const argValues = args.map(argName => {

            // Special names
            if (argName === 'task')
                return task;
            if (argName === 'step')
                return task;
            if (argName === 'query')
                return (q, p) => task.query(q, p);
            if (argName === 'item')
                return task.args();
            if (argName === 'graph')
                return task.graph;

            return task.getOptional(argName, null)
        });
        return func.apply(null, argValues);
    }
}

export function setupFunctionWithJavascriptMagic(decl: string, func: Function): Handler {
    const handler = parseHandler(decl)
        .withCallback( getHandlerWithJavascriptMagic(func) );

    return handler;
}
