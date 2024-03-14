const Node = artifacts.require("Node");
const CrynuxToken = artifacts.require("CrynuxToken");
const Task = artifacts.require("Task");
const QOS = artifacts.require("QOS");

const { prepareTask, prepareNetwork, prepareUser, getCommitment, prepareNode } = require("./utils");
const { time } = require("@openzeppelin/test-helpers")

contract("Task normal QOS score", (accounts) => {
    it("test normal task qos score", async () => {
        const taskInstance = await Task.deployed();
        const cnxInstance = await CrynuxToken.deployed();
        const nodeInstance = await Node.deployed();
        const qosInstance = await QOS.deployed();

        await prepareNetwork(accounts, cnxInstance, nodeInstance);
        await prepareUser(accounts[1], cnxInstance, taskInstance);

        const [taskId, nodeRounds] = await prepareTask(accounts, cnxInstance, nodeInstance, taskInstance);

        const result = "0x0102030405060708";

        // submit commitment
        for (let i = 0; i < 3; i++) {
            const [commitment, nonce] = getCommitment(result);
            await taskInstance.submitTaskResultCommitment(
                taskId,
                nodeRounds[accounts[2 + i]],
                commitment,
                nonce,
                { from: accounts[2 + i] });
        }

        // disclose task
        for (let i = 0; i < 3; i++) {
            await taskInstance.discloseTaskResult(
                taskId,
                nodeRounds[accounts[2 + i]],
                result,
                { from: accounts[2 + i] },
            );
        }

        await taskInstance.reportResultsUploaded(
            taskId,
            nodeRounds[accounts[2]],
            { from: accounts[2] },
        );

        let score = await qosInstance.getTaskScore(accounts[2]);
        assert.equal(score.toNumber(), 20);

        score = await qosInstance.getTaskScore(accounts[3]);
        assert.equal(score.toNumber(), 18);

        score = await qosInstance.getTaskScore(accounts[4]);
        assert.equal(score.toNumber(), 12);
    })
})

contract("Task slash qos score", (accounts) => {
    it("test task slash qos score", async () => {
        const taskInstance = await Task.deployed();
        const cnxInstance = await CrynuxToken.deployed();
        const nodeInstance = await Node.deployed();
        const qosInstance = await QOS.deployed();

        await prepareNetwork(accounts, cnxInstance, nodeInstance);
        await prepareUser(accounts[1], cnxInstance, taskInstance);
        const [taskId, nodeRounds] = await prepareTask(accounts, cnxInstance, nodeInstance, taskInstance);

        const result = "0x0102030405060708";
        const errResult = "0x0101010101010101"
        // submit commitment
        for (let i = 0; i < 2; i++) {
            const [commitment, nonce] = getCommitment(result);
            await taskInstance.submitTaskResultCommitment(
                taskId,
                nodeRounds[accounts[2 + i]],
                commitment,
                nonce,
                { from: accounts[2 + i] });
        }
        const [errCommitment, errNonce] = getCommitment(errResult);
        await taskInstance.submitTaskResultCommitment(
            taskId,
            nodeRounds[accounts[4]],
            errCommitment,
            errNonce,
            { from: accounts[4] },
        );

        // disclose task
        for (let i = 0; i < 2; i++) {
            await taskInstance.discloseTaskResult(
                taskId,
                nodeRounds[accounts[2 + i]],
                result,
                { from: accounts[2 + i] },
            );
        }
        await taskInstance.discloseTaskResult(
            taskId,
            nodeRounds[accounts[4]],
            errResult,
            { from: accounts[4] },
        );

        await taskInstance.reportResultsUploaded(
            taskId,
            nodeRounds[accounts[2]],
            { from: accounts[2] },
        );

        let score = await qosInstance.getTaskScore(accounts[2]);
        assert.equal(score.toNumber(), 20);

        score = await qosInstance.getTaskScore(accounts[3]);
        assert.equal(score.toNumber(), 18);

        score = await qosInstance.getTaskScore(accounts[4]);
        assert.equal(score.toNumber(), 0);
        
        for (let i = 0; i < 2; i++) {
            let status = await nodeInstance.getNodeStatus(accounts[2 + i]);
            assert.equal(status.toNumber(), 1)
        }
        let status = await nodeInstance.getNodeStatus(accounts[4]);
        assert.equal(status.toNumber(), 0);
    })
})

contract("Task report error qos score", (accounts) => {
    it("test task report error qos score", async () => {
        const taskInstance = await Task.deployed();
        const cnxInstance = await CrynuxToken.deployed();
        const nodeInstance = await Node.deployed();
        const qosInstance = await QOS.deployed();

        await prepareNetwork(accounts, cnxInstance, nodeInstance);
        await prepareUser(accounts[1], cnxInstance, taskInstance);
        const [taskId, nodeRounds] = await prepareTask(accounts, cnxInstance, nodeInstance, taskInstance);

        for (let i = 0; i < 3; i++) {
            await taskInstance.reportTaskError(
                taskId,
                nodeRounds[accounts[2 + i]],
                { from: accounts[2 + i] }
            );
        }

        let score = await qosInstance.getTaskScore(accounts[2]);
        assert.equal(score.toNumber(), 20);

        score = await qosInstance.getTaskScore(accounts[3]);
        assert.equal(score.toNumber(), 18);

        score = await qosInstance.getTaskScore(accounts[4]);
        assert.equal(score.toNumber(), 12);

        for (let i = 0; i < 3; i++) {
            let status = await nodeInstance.getNodeStatus(accounts[2 + i]);
            assert.equal(status.toNumber(), 1)
        }
    })
})

contract("Node kick out", (accounts) => {
    it("test node kick out when node timeout, timeout", async () => {
        const taskInstance = await Task.deployed();
        const cnxInstance = await CrynuxToken.deployed();
        const nodeInstance = await Node.deployed();

        await prepareNetwork(accounts, cnxInstance, nodeInstance);
        await prepareUser(accounts[1], cnxInstance, taskInstance);
        // task 1
        {
            const [taskId, nodeRounds] = await prepareTask(accounts, cnxInstance, nodeInstance, taskInstance);
        
            const result = "0x0102030405060708";
    
            for (let i = 0; i < 2; i++) {
                const [commitment, nonce] = getCommitment(result);
                await taskInstance.submitTaskResultCommitment(
                    taskId,
                    nodeRounds[accounts[2 + i]],
                    commitment,
                    nonce,
                    { from: accounts[2 + i] });
            }
            await time.increase(time.duration.hours(1));
            await taskInstance.cancelTask(taskId, { from: accounts[4] });
        }

        // task 2
        {
            const [taskId, nodeRounds] = await prepareTask(accounts, cnxInstance, nodeInstance, taskInstance);
    
            const result = "0x0102030405060708";
    
            for (let i = 0; i < 2; i++) {
                const [commitment, nonce] = getCommitment(result);
                await taskInstance.submitTaskResultCommitment(
                    taskId,
                    nodeRounds[accounts[2 + i]],
                    commitment,
                    nonce,
                    { from: accounts[2 + i] });
            }
            await time.increase(time.duration.hours(1));
            await taskInstance.cancelTask(taskId, { from: accounts[4] });
        }

        let status = await nodeInstance.getNodeStatus(accounts[4]);
        assert.equal(status.toNumber(), 0);

        status = await nodeInstance.getNodeStatus(accounts[3]);
        assert.equal(status.toNumber(), 1);
        status = await nodeInstance.getNodeStatus(accounts[2]);
        assert.equal(status.toNumber(), 1);
    })
})

contract("Node kick out", (accounts) => {
    it("test node kick out when node normal, timeout, timeout", async () => {
        const taskInstance = await Task.deployed();
        const cnxInstance = await CrynuxToken.deployed();
        const nodeInstance = await Node.deployed();

        await prepareNetwork(accounts, cnxInstance, nodeInstance);
        await prepareUser(accounts[1], cnxInstance, taskInstance);
        // task 1
        {
            const [taskId, nodeRounds] = await prepareTask(accounts, cnxInstance, nodeInstance, taskInstance);
    
            for (let i = 0; i < 3; i++) {
                await taskInstance.reportTaskError(
                    taskId,
                    nodeRounds[accounts[2 + i]],
                    { from: accounts[2 + i] }    
                );
            }
        }

        await prepareUser(accounts[1], cnxInstance, taskInstance);
        // task 2
        {
            const [taskId, nodeRounds] = await prepareTask(accounts, cnxInstance, nodeInstance, taskInstance);
        
            const result = "0x0102030405060708";
    
            for (let i = 0; i < 2; i++) {
                const [commitment, nonce] = getCommitment(result);
                await taskInstance.submitTaskResultCommitment(
                    taskId,
                    nodeRounds[accounts[2 + i]],
                    commitment,
                    nonce,
                    { from: accounts[2 + i] });
            }
            await time.increase(time.duration.hours(1));
            await taskInstance.cancelTask(taskId, { from: accounts[4] });
        }

        // task 3
        {
            const [taskId, nodeRounds] = await prepareTask(accounts, cnxInstance, nodeInstance, taskInstance);
    
            const result = "0x0102030405060708";
    
            for (let i = 0; i < 2; i++) {
                const [commitment, nonce] = getCommitment(result);
                await taskInstance.submitTaskResultCommitment(
                    taskId,
                    nodeRounds[accounts[2 + i]],
                    commitment,
                    nonce,
                    { from: accounts[2 + i] });
            }
            await time.increase(time.duration.hours(1));
            await taskInstance.cancelTask(taskId, { from: accounts[4] });
        }

        let status = await nodeInstance.getNodeStatus(accounts[4]);
        assert.equal(status.toNumber(), 0);

        status = await nodeInstance.getNodeStatus(accounts[3]);
        assert.equal(status.toNumber(), 1);
        status = await nodeInstance.getNodeStatus(accounts[2]);
        assert.equal(status.toNumber(), 1);
    })
})

contract("Node kick out", (accounts) => {
    it("test node kick out when node timeout, normal, timeout", async () => {
        const taskInstance = await Task.deployed();
        const cnxInstance = await CrynuxToken.deployed();
        const nodeInstance = await Node.deployed();

        await prepareNetwork(accounts, cnxInstance, nodeInstance);
        await prepareUser(accounts[1], cnxInstance, taskInstance);
        // task 1
        {
            const [taskId, nodeRounds] = await prepareTask(accounts, cnxInstance, nodeInstance, taskInstance);
        
            const result = "0x0102030405060708";
    
            for (let i = 0; i < 2; i++) {
                const [commitment, nonce] = getCommitment(result);
                await taskInstance.submitTaskResultCommitment(
                    taskId,
                    nodeRounds[accounts[2 + i]],
                    commitment,
                    nonce,
                    { from: accounts[2 + i] });
            }
            await time.increase(time.duration.hours(1));
            await taskInstance.cancelTask(taskId, { from: accounts[4] });
        }

        // task 2
        {
            const [taskId, nodeRounds] = await prepareTask(accounts, cnxInstance, nodeInstance, taskInstance);
    
            for (let i = 0; i < 3; i++) {
                await taskInstance.reportTaskError(
                    taskId,
                    nodeRounds[accounts[2 + i]],
                    { from: accounts[2 + i] }    
                );
            }
        }

        // task 3
        await prepareUser(accounts[1], cnxInstance, taskInstance);
        {
            const [taskId, nodeRounds] = await prepareTask(accounts, cnxInstance, nodeInstance, taskInstance);
    
            const result = "0x0102030405060708";
    
            for (let i = 0; i < 2; i++) {
                const [commitment, nonce] = getCommitment(result);
                await taskInstance.submitTaskResultCommitment(
                    taskId,
                    nodeRounds[accounts[2 + i]],
                    commitment,
                    nonce,
                    { from: accounts[2 + i] });
            }
            await time.increase(time.duration.hours(1));
            await taskInstance.cancelTask(taskId, { from: accounts[4] });
        }

        let status = await nodeInstance.getNodeStatus(accounts[4]);
        assert.equal(status.toNumber(), 0);

        status = await nodeInstance.getNodeStatus(accounts[3]);
        assert.equal(status.toNumber(), 1);
        status = await nodeInstance.getNodeStatus(accounts[2]);
        assert.equal(status.toNumber(), 1);
    })
})