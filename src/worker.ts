import { NativeConnection, Worker } from '@temporalio/worker';
import * as activities from './activities';
async function run() {
 const connection=await NativeConnection.connect({address:process.env.TEMPORAL_ADDRESS??'localhost:7233'});
 const worker=await Worker.create({connection,namespace:'default',taskQueue:'juniper-salon',workflowsPath:require.resolve('./workflows'),activities});
 console.log('Juniper Worker running on juniper-salon.'); await worker.run();
}
run().catch(error=>{console.error(error);process.exit(1);});
