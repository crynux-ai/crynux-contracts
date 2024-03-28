const { assert, expect } = require("chai");
const helpers = require("@nomicfoundation/hardhat-network-helpers");
const { Verifier } = require("./utils");
const { anyValue } = require("@nomicfoundation/hardhat-chai-matchers/withArgs");

describe("Task normal QOS score", () => {
    it("test normal task qos score", async () => {
        let v = new Verifier();
        await v.init();
        await v.prepareNetwork();
        await v.prepareUser(v.user);
        const [taskId, nodeRounds] = await v.prepareTask(v.user, v.accounts);

        const result = "0x0102030405060708";

        // submit commitment
        for (let i = 0; i < 3; i++) {
            const [commitment, nonce] = await v.getCommitment(result);
            await v.taskInstance.connect(v.accounts[i]).submitTaskResultCommitment(
                taskId,
                nodeRounds[v.accounts[i].address],
                commitment,
                nonce);
        }

        // disclose task
        for (let i = 0; i < 3; i++) {
            await v.taskInstance.connect(v.accounts[i]).discloseTaskResult(
                taskId,
                nodeRounds[v.accounts[i].address],
                result,
            );
        }

        await v.taskInstance.connect(v.accounts[0]).reportResultsUploaded(
            taskId,
            nodeRounds[v.accounts[0].address],
        );

        let score = await v.qosInstance.getTaskScore(v.accounts[0]);
        assert.equal(score, 20);

        score = await v.qosInstance.getTaskScore(v.accounts[1]);
        assert.equal(score, 18);

        score = await v.qosInstance.getTaskScore(v.accounts[2]);
        assert.equal(score, 12);
    })
})

describe("Task slash qos score", () => {
    it("test task slash qos score", async () => {
        let v = new Verifier();
        await v.init();
        await v.prepareNetwork();
        await v.prepareUser(v.user);
        const [taskId, nodeRounds] = await v.prepareTask(v.user, v.accounts);

        const result = "0x0102030405060708";
        const errResult = "0x0101010101010101"
        // submit commitment
        for (let i = 0; i < 2; i++) {
            const [commitment, nonce] = await v.getCommitment(result);
            await v.taskInstance.connect(v.accounts[i]).submitTaskResultCommitment(
                taskId,
                nodeRounds[v.accounts[i].address],
                commitment,
                nonce);
        }
        const [errCommitment, errNonce] = await v.getCommitment(errResult);
        await v.taskInstance.connect(v.accounts[2]).submitTaskResultCommitment(
            taskId,
            nodeRounds[v.accounts[2].address],
            errCommitment,
            errNonce,
        );

        // disclose task
        for (let i = 0; i < 2; i++) {
            await v.taskInstance.connect(v.accounts[i]).discloseTaskResult(
                taskId,
                nodeRounds[v.accounts[i].address],
                result,
            );
        }
        await v.taskInstance.connect(v.accounts[2]).discloseTaskResult(
            taskId,
            nodeRounds[v.accounts[2].address],
            errResult,
        );

        await v.taskInstance.connect(v.accounts[0]).reportResultsUploaded(
            taskId,
            nodeRounds[v.accounts[0].address],
        );

        let score = await v.qosInstance.getTaskScore(v.accounts[0]);
        assert.equal(score, 20);

        score = await v.qosInstance.getTaskScore(v.accounts[1]);
        assert.equal(score, 18);

        score = await v.qosInstance.getTaskScore(v.accounts[2]);
        assert.equal(score, 0);

        for (let i = 0; i < 2; i++) {
            let status = await v.nodeInstance.getNodeStatus(v.accounts[i]);
            assert.equal(status, 1)
        }
        let status = await v.nodeInstance.getNodeStatus(v.accounts[2]);
        assert.equal(status, 0);
    })
})

describe("Task report error qos score", () => {
    it("test task report error qos score", async () => {
        let v = new Verifier();
        await v.init();
        await v.prepareNetwork();
        await v.prepareUser(v.user);
        const [taskId, nodeRounds] = await v.prepareTask(v.user, v.accounts);

        for (let i = 0; i < 3; i++) {
            await v.taskInstance.connect(v.accounts[i]).reportTaskError(
                taskId,
                nodeRounds[v.accounts[i].address]
            );
        }

        let score = await v.qosInstance.getTaskScore(v.accounts[0]);
        assert.equal(score, 20);

        score = await v.qosInstance.getTaskScore(v.accounts[1]);
        assert.equal(score, 18);

        score = await v.qosInstance.getTaskScore(v.accounts[2]);
        assert.equal(score, 12);

        for (let i = 0; i < 3; i++) {
            let status = await v.nodeInstance.getNodeStatus(v.accounts[i]);
            assert.equal(status, 1)
        }
    })
})

describe("Node kick out", () => {
    it("test node kick out when node timeout, timeout", async () => {
        let v = new Verifier();
        await v.init();
        await v.prepareNetwork();
        await v.prepareUser(v.user);

        // task 1
        {
            const [taskId, nodeRounds] = await v.prepareTask(v.user, v.accounts);

            const result = "0x0102030405060708";

            for (let i = 0; i < 2; i++) {
                const [commitment, nonce] = await v.getCommitment(result);
                await v.taskInstance.connect(v.accounts[i]).submitTaskResultCommitment(
                    taskId,
                    nodeRounds[v.accounts[i].address],
                    commitment,
                    nonce);
            }
            await helpers.time.increase(helpers.time.duration.hours(1));
            await v.taskInstance.connect(v.accounts[2]).cancelTask(taskId);
        }

        // task 2
        {
            const [taskId, nodeRounds] = await v.prepareTask(v.user, v.accounts);

            const result = "0x0102030405060708";

            for (let i = 0; i < 2; i++) {
                const [commitment, nonce] = await v.getCommitment(result);
                await v.taskInstance.connect(v.accounts[i]).submitTaskResultCommitment(
                    taskId,
                    nodeRounds[v.accounts[i].address],
                    commitment,
                    nonce);
            }
            await helpers.time.increase(helpers.time.duration.hours(1));
            await v.taskInstance.connect(v.accounts[2]).cancelTask(taskId);
        }

        let status = await v.nodeInstance.getNodeStatus(v.accounts[2]);
        assert.equal(status, 0);

        status = await v.nodeInstance.getNodeStatus(v.accounts[1]);
        assert.equal(status, 1);
        status = await v.nodeInstance.getNodeStatus(v.accounts[0]);
        assert.equal(status, 1);
    })

    it("test the kicked out node can join the network and execute task without being kicked out again", async () => {
        let v = new Verifier();
        await v.init();
        await v.prepareNetwork();
        await v.prepareUser(v.user);
        const [taskId, nodeRounds] = await v.prepareTask(v.user, v.accounts);


        const result = "0x0102030405060708";

        for (let i = 0; i < 3; i++) {
            const [commitment, nonce] = await v.getCommitment(result);
            await v.taskInstance.connect(v.accounts[i]).submitTaskResultCommitment(
                taskId,
                nodeRounds[v.accounts[i].address],
                commitment,
                nonce);
        }
        for (let i = 0; i < 3; i++) {
            await v.taskInstance.connect(v.accounts[i]).discloseTaskResult(
                taskId,
                nodeRounds[v.accounts[i].address],
                result,
            );
        }
        await v.taskInstance.connect(v.accounts[0]).reportResultsUploaded(
            taskId,
            nodeRounds[v.accounts[0].address],
        );

        for (let i = 0; i < 3; i++) {
            const status = await v.nodeInstance.getNodeStatus(v.accounts[i]);
            assert.equal(status, 1);
        }
    })
})

describe("Node kick out", () => {
    it("test node kick out when node normal, timeout, timeout", async () => {
        let v = new Verifier();
        await v.init();
        await v.prepareNetwork();
        await v.prepareUser(v.user);

        // task 1
        {
            const [taskId, nodeRounds] = await v.prepareTask(v.user, v.accounts);

            for (let i = 0; i < 3; i++) {
                await v.taskInstance.connect(v.accounts[i]).reportTaskError(
                    taskId,
                    nodeRounds[v.accounts[i].address]
                );
            }
        }

        await v.prepareUser(v.accounts[1]);
        // task 2
        {
            const [taskId, nodeRounds] = await v.prepareTask(v.user, v.accounts);

            const result = "0x0102030405060708";

            for (let i = 0; i < 2; i++) {
                const [commitment, nonce] = await v.getCommitment(result);
                await v.taskInstance.connect(v.accounts[i]).submitTaskResultCommitment(
                    taskId,
                    nodeRounds[v.accounts[i].address],
                    commitment,
                    nonce);
            }
            await helpers.time.increase(helpers.time.duration.hours(1));
            await v.taskInstance.connect(v.accounts[2]).cancelTask(taskId);
        }

        // task 3
        {
            const [taskId, nodeRounds] = await v.prepareTask(v.user, v.accounts);

            const result = "0x0102030405060708";

            for (let i = 0; i < 2; i++) {
                const [commitment, nonce] = await v.getCommitment(result);
                await v.taskInstance.connect(v.accounts[i]).submitTaskResultCommitment(
                    taskId,
                    nodeRounds[v.accounts[i].address],
                    commitment,
                    nonce);
            }
            await helpers.time.increase(helpers.time.duration.hours(1));
            await v.taskInstance.connect(v.accounts[2]).cancelTask(taskId);
        }

        let status = await v.nodeInstance.getNodeStatus(v.accounts[2]);
        assert.equal(status, 0);

        status = await v.nodeInstance.getNodeStatus(v.accounts[1]);
        assert.equal(status, 1);
        status = await v.nodeInstance.getNodeStatus(v.accounts[0]);
        assert.equal(status, 1);
    })

    it("test the kicked out node can join the network and execute task without being kicked out again", async () => {
        let v = new Verifier();
        await v.init();
        await v.prepareNetwork();
        await v.prepareUser(v.user);
        const [taskId, nodeRounds] = await v.prepareTask(v.user, v.accounts);

        const result = "0x0102030405060708";

        for (let i = 0; i < 3; i++) {
            const [commitment, nonce] = await v.getCommitment(result);
            await v.taskInstance.connect(v.accounts[i]).submitTaskResultCommitment(
                taskId,
                nodeRounds[v.accounts[i].address],
                commitment,
                nonce);
        }
        for (let i = 0; i < 3; i++) {
            await v.taskInstance.connect(v.accounts[i]).discloseTaskResult(
                taskId,
                nodeRounds[v.accounts[i].address],
                result,
            );
        }
        await v.taskInstance.connect(v.accounts[0]).reportResultsUploaded(
            taskId,
            nodeRounds[v.accounts[0].address],
        );

        for (let i = 0; i < 3; i++) {
            const status = await v.nodeInstance.getNodeStatus(v.accounts[i]);
            assert.equal(status, 1);
        }

    })
})

describe("Node kick out", () => {
    it("test node kick out when node timeout, normal, timeout", async () => {
        let v = new Verifier();
        await v.init();
        await v.prepareNetwork();
        await v.prepareUser(v.user);

        // task 1
        {
            const [taskId, nodeRounds] = await v.prepareTask(v.user, v.accounts);

            const result = "0x0102030405060708";

            for (let i = 0; i < 2; i++) {
                const [commitment, nonce] = await v.getCommitment(result);
                await v.taskInstance.connect(v.accounts[i]).submitTaskResultCommitment(
                    taskId,
                    nodeRounds[v.accounts[i].address],
                    commitment,
                    nonce);
            }
            await helpers.time.increase(helpers.time.duration.hours(1));
            await v.taskInstance.connect(v.accounts[2]).cancelTask(taskId);
        }

        // task 2
        {
            const [taskId, nodeRounds] = await v.prepareTask(v.user, v.accounts);

            for (let i = 0; i < 3; i++) {
                await v.taskInstance.connect(v.accounts[i]).reportTaskError(
                    taskId,
                    nodeRounds[v.accounts[i].address],
                );
            }
        }

        // task 3
        await v.prepareUser(v.accounts[1]);
        {
            const [taskId, nodeRounds] = await v.prepareTask(v.user, v.accounts);

            const result = "0x0102030405060708";

            for (let i = 0; i < 2; i++) {
                const [commitment, nonce] = await v.getCommitment(result);
                await v.taskInstance.connect(v.accounts[i]).submitTaskResultCommitment(
                    taskId,
                    nodeRounds[v.accounts[i].address],
                    commitment,
                    nonce);
            }
            await helpers.time.increase(helpers.time.duration.hours(1));
            await v.taskInstance.connect(v.accounts[2]).cancelTask(taskId);
        }

        let status = await v.nodeInstance.getNodeStatus(v.accounts[2]);
        assert.equal(status, 0);

        status = await v.nodeInstance.getNodeStatus(v.accounts[1]);
        assert.equal(status, 1);
        status = await v.nodeInstance.getNodeStatus(v.accounts[0]);
        assert.equal(status, 1);
    })

    it("test the kicked out node can join the network and execute task without being kicked out again", async () => {
        let v = new Verifier();
        await v.init();
        await v.prepareNetwork();
        await v.prepareUser(v.user);
        const [taskId, nodeRounds] = await v.prepareTask(v.user, v.accounts);

        const result = "0x0102030405060708";

        for (let i = 0; i < 3; i++) {
            const [commitment, nonce] = await v.getCommitment(result);
            await v.taskInstance.connect(v.accounts[i]).submitTaskResultCommitment(
                taskId,
                nodeRounds[v.accounts[i].address],
                commitment,
                nonce);
        }
        for (let i = 0; i < 3; i++) {
            await v.taskInstance.connect(v.accounts[i]).discloseTaskResult(
                taskId,
                nodeRounds[v.accounts[i].address],
                result,
            );
        }
        await v.taskInstance.connect(v.accounts[0]).reportResultsUploaded(
            taskId,
            nodeRounds[v.accounts[0].address],
        );

        for (let i = 0; i < 3; i++) {
            const status = await v.nodeInstance.getNodeStatus(v.accounts[i]);
            assert.equal(status, 1);
        }

    })
})

describe("Node timeout", () => {
    it("test node qos score when all nodes timeout in a task", async () => {
        let v = new Verifier();
        await v.init();
        await v.prepareNetwork();
        await v.prepareUser(v.user);
        const [taskId, nodeRounds] = await v.prepareTask(v.user, v.accounts);

        await helpers.time.increase(helpers.time.duration.hours(1));
        await v.taskInstance.connect(v.accounts[2]).cancelTask(taskId);

        const scores = [20, 18, 12]

        for (let i = 0; i < 3; i++) {
            const account = v.accounts[i];
            const round = nodeRounds[account.address];
            const score = await v.qosInstance.getTaskScore(account);
            assert.equal(score, scores[round], `Wrong task score ${round}`);
        }
    })
})
