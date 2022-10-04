
import { StackTraceAllConsoleLogs } from '../../config'

if (StackTraceAllConsoleLogs) {
    let originalConsoleLog = console.log;
    console.log = (...strs: string[]) => {
        originalConsoleLog.apply(null, strs);
        const stackLines = ((new Error()).stack + '').replace(/^Error:/, '');
        originalConsoleLog('console.log call: ' + stackLines);
    }
    
    let originalConsoleWarn = console.warn;
    console.warn = (...strs: string[]) => {
        originalConsoleWarn.apply(null, strs);
        const stackLines = ((new Error()).stack + '').replace(/^Error:/, '');
        originalConsoleWarn('console.warn call: ' + stackLines);
    }

    let originalConsoleError = console.error;
    console.error = (...strs: string[]) => {
        originalConsoleError.apply(null, strs);
        const stackLines = ((new Error()).stack + '').replace(/^Error:/, '');
        originalConsoleError('console.error call: ' + stackLines);
    }
}
