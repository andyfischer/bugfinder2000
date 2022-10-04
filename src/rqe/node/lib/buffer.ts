
import { func } from '../../globalGraph'

func('$base64 -> hex', (base64) => {
    const buffer = Buffer.from(base64, 'base64');
    return { hex: buffer.toString('hex') }
});
