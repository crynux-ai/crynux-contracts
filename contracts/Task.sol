// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.18;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

import "./Node.sol";
import "./Random.sol";
import "./Hamming.sol";
import "./QOS.sol";

contract Task is Ownable {
    using Random for Random.Generator;

    uint private TASK_TYPE_SD = 0;
    uint private TASK_TYPE_LLM = 1;

    struct TaskInfo {
        uint256 id;
        uint taskType;
        address creator;
        bytes32 taskHash;
        bytes32 dataHash;
        uint vramLimit;
        bool isSuccess;
        address[] selectedNodes;
        bytes32[] commitments;
        bytes32[] nonces;
        bytes[] results;
        uint[] resultDisclosedRounds;
        address resultNode;
        bool aborted;
        uint256 timeout;
        uint256 balance;
    }

    Node private node;
    QOS private qos;
    IERC20 private cnxToken;
    mapping(uint => TaskInfo) private tasks;
    mapping(address => uint256) private nodeTasks;
    uint256 private nextTaskId;

    uint256 private taskFeePerNode;
    uint private distanceThreshold;
    uint256 private timeout;

    uint256 private numSuccessTasks;
    uint256 private numAbortedTasks;

    Random.Generator private generator;

    event TaskCreated(
        uint256 taskId,
        uint256 taskType,
        address indexed creator,
        address indexed selectedNode,
        bytes32 taskHash,
        bytes32 dataHash,
        uint round
    );
    event TaskResultCommitmentsReady(uint256 taskId);
    event TaskSuccess(uint256 taskId, bytes result, address indexed resultNode);
    event TaskAborted(uint256 taskId, string reason);

    constructor(Node nodeInstance, IERC20 tokenInstance, QOS qosInstance) {
        node = nodeInstance;
        cnxToken = tokenInstance;
        qos = qosInstance;
        taskFeePerNode = 10 * 10 ** 18;
        nextTaskId = 1;
        distanceThreshold = 5;
        timeout = 15 minutes;
        numSuccessTasks = 0;
        numAbortedTasks = 0;
    }

    function createTask(
        uint taskType,
        bytes32 taskHash,
        bytes32 dataHash,
        uint vramLimit
    ) public {
        uint256 taskFee = taskFeePerNode * 3;

        require(
            taskType == TASK_TYPE_SD || taskType == TASK_TYPE_LLM,
            "Invalid task type"
        );
        require(
            cnxToken.balanceOf(msg.sender) >= taskFee,
            "Not enough tokens for task"
        );
        require(
            cnxToken.allowance(msg.sender, address(this)) >= taskFee,
            "Not enough allowance for task"
        );

        TaskInfo memory taskInfo;

        taskInfo.id = nextTaskId++;
        taskInfo.creator = msg.sender;
        taskInfo.timeout = block.timestamp + timeout;
        taskInfo.balance = taskFee;
        taskInfo.taskType = taskType;
        taskInfo.taskHash = taskHash;
        taskInfo.dataHash = dataHash;
        taskInfo.vramLimit = vramLimit;
        taskInfo.isSuccess = false;
        taskInfo.commitments = new bytes32[](3);
        taskInfo.nonces = new bytes32[](3);
        taskInfo.results = new bytes[](3);
        taskInfo.aborted = false;

        tasks[taskInfo.id] = taskInfo;

        require(
            cnxToken.transferFrom(msg.sender, address(this), taskFee),
            "Task fee payment failed"
        );

        bytes32 seed = keccak256(
            abi.encodePacked(blockhash(block.number - 1), taskHash, dataHash)
        );
        address[] memory nodeAddresses = getSelectedNodes(
            3,
            vramLimit,
            taskType == TASK_TYPE_LLM,
            seed
        );
        for (uint i = 0; i < 3; i++) {
            address nodeAddress = nodeAddresses[i];
            tasks[taskInfo.id].selectedNodes.push(nodeAddress);
            nodeTasks[nodeAddress] = taskInfo.id;
            emit TaskCreated(
                taskInfo.id,
                taskType,
                msg.sender,
                nodeAddress,
                taskHash,
                dataHash,
                i
            );
        }
    }

    function getSelectedNodes(
        uint k,
        uint vramLimit,
        bool useSameGPU,
        bytes32 seed
    ) private returns (address[] memory) {
        generator.manualSeed(seed);
        address nodeAddress;
        address[] memory res = new address[](k);

        if (useSameGPU) {
            (bytes32[] memory gpuIDs, uint[] memory counts) = node.filterGPUID(vramLimit, k);
            uint index = generator.multinomial(counts, 0, counts.length);
            bytes32 gpuID = gpuIDs[index];
            for (uint i = 0; i < k; i++) {
                nodeAddress = node.selectNodeByGPUID(gpuID, generator.randint());
                node.startTask(nodeAddress);
                res[i] = nodeAddress;
            }
        } else if (vramLimit > 0) {
            for (uint i = 0; i < k; i++) {
                (uint[] memory vrams, uint[] memory counts) = node.filterGPUVram(vramLimit, 1);
                uint index = generator.multinomial(counts, 0, counts.length);
                uint vram = vrams[index];
                nodeAddress = node.selectNodeByGPUVram(vram, generator.randint());
                node.startTask(nodeAddress);
                res[i] = nodeAddress;
            }
        } else {
            for (uint i = 0; i < k; i++) {
                nodeAddress = node.selectNode(generator.randint());
                node.startTask(nodeAddress);
                res[i] = nodeAddress;
            }
        }

        return res;
    }

    function submitTaskResultCommitment(
        uint256 taskId,
        uint round,
        bytes32 commitment,
        bytes32 nonce
    ) public {
        require(tasks[taskId].id != 0, "Task not exist");
        require(round >= 0 && round < 3, "Round not exist");
        require(
            tasks[taskId].selectedNodes[round] == msg.sender,
            "Not selected node"
        );
        require(tasks[taskId].commitments[round] == 0, "Already submitted");
        require(!tasks[taskId].aborted, "Task is aborted");

        require(
            nonce != tasks[taskId].nonces[0] &&
                nonce != tasks[taskId].nonces[1] &&
                nonce != tasks[taskId].nonces[2],
            "Nonce already used"
        );

        uint index = 0;
        for (uint i = 0; i < 3; i++) {
            if (tasks[taskId].commitments[i] != 0) {
                index++;
            }
        }
        qos.addTaskScore(msg.sender, index);
        tasks[taskId].commitments[round] = commitment;
        tasks[taskId].nonces[round] = nonce;

        if (isCommitmentReady(taskId)) {
            emit TaskResultCommitmentsReady(taskId);
        }
    }

    function isCommitmentReady(uint256 taskId) internal view returns (bool) {
        uint commitmentCount = 0;
        uint errCount = 0;
        for (uint i = 0; i < 3; i++) {
            bytes32 commitment = tasks[taskId].commitments[i];
            if (commitment != 0) {
                commitmentCount += 1;
                if (commitment == bytes32(uint256(1))) {
                    errCount += 1;
                }
            }
        }
        return commitmentCount == 3 && errCount < 2;
    }

    function discloseTaskResult(
        uint256 taskId,
        uint round,
        bytes calldata result
    ) public {
        require(result.length > 0, "Invalid result");
        require(tasks[taskId].id != 0, "Task not exist");
        require(round >= 0 && round < 3, "Round not exist");
        require(
            tasks[taskId].selectedNodes[round] == msg.sender,
            "Not selected node"
        );
        require(tasks[taskId].results[round].length == 0, "Already submitted");
        require(
            tasks[taskId].commitments[0] != 0 &&
                tasks[taskId].commitments[1] != 0 &&
                tasks[taskId].commitments[2] != 0,
            "Commitments not ready"
        );
        require(!tasks[taskId].aborted, "Task is aborted");

        require(
            tasks[taskId].commitments[round] ==
                keccak256(
                    abi.encodePacked(result, tasks[taskId].nonces[round])
                ),
            "Mismatch result and commitment"
        );

        tasks[taskId].results[round] = result;
        qos.addTaskScore(msg.sender, tasks[taskId].resultDisclosedRounds.length);
        tasks[taskId].resultDisclosedRounds.push(round);

        checkTaskResult(taskId);
    }

    function tryDeleteTask(uint256 taskId) internal {
        // Delete task when all nodes were settled or slashed.
        require(tasks[taskId].id != 0, "Task not exist");

        for (uint i = 0; i < 3; i++) {
            if (nodeTasks[tasks[taskId].selectedNodes[i]] != 0) {
                return;
            }
        }
        delete tasks[taskId];
    }

    function reportResultsUploaded(uint256 taskId, uint round) public {
        require(tasks[taskId].id != 0, "Task not exist");
        require(round >= 0 && round < 3, "Round not exist");
        require(
            tasks[taskId].selectedNodes[round] == msg.sender,
            "Not selected node"
        );
        require(tasks[taskId].resultNode == msg.sender, "Not result round");
        require(!tasks[taskId].aborted, "Task is aborted");

        settleNodeByRound(taskId, round);
        tryDeleteTask(taskId);
    }

    function reportTaskError(uint256 taskId, uint round) public {
        require(tasks[taskId].id != 0, "Task not exist");
        require(round >= 0 && round < 3, "Round not exist");
        require(
            tasks[taskId].selectedNodes[round] == msg.sender,
            "Not selected node"
        );
        require(tasks[taskId].commitments[round] == 0, "Already submitted");

        uint index = 0;
        for (uint i = 0; i < 3; i++) {
            if (tasks[taskId].commitments[i] != 0) {
                index++;
            }
        }
        qos.addTaskScore(msg.sender, index);
        uint256 errCommitment = 1;
        tasks[taskId].commitments[round] = bytes32(errCommitment); // Set to a non-zero value to enter result committed state

        qos.addTaskScore(msg.sender, tasks[taskId].resultDisclosedRounds.length);
        tasks[taskId].resultDisclosedRounds.push(round); // Set to result disclosed state, the result is a special zero value

        if (isCommitmentReady(taskId)) {
            emit TaskResultCommitmentsReady(taskId);
        }

        checkTaskResult(taskId);
    }

    function cancelTask(uint256 taskId) public {
        require(tasks[taskId].id != 0, "Task not exist");
        bool callerValid = false;
        if (msg.sender == tasks[taskId].creator) {
            callerValid = true;
        } else {
            for (uint i = 0; i < 3; i++) {
                if (tasks[taskId].selectedNodes[i] == msg.sender) {
                    callerValid = true;
                    break;
                }
            }
        }
        require(callerValid, "Unauthorized to cancel task");
        require(
            block.timestamp > tasks[taskId].timeout,
            "Task has not exceeded the deadline yet"
        );
        // return unuses task fee to task creator
        if (tasks[taskId].balance > 0) {
            require(
                cnxToken.transfer(tasks[taskId].creator, tasks[taskId].balance),
                "Token transfer failed"
            );
            tasks[taskId].balance = 0;
        }

        if (!tasks[taskId].aborted) {
            emit TaskAborted(taskId, "Task Cancelled");
        }
        // free unfinished nodes and delete the task
        for (uint i = 0; i < 3; i++) {
            address nodeAddress = tasks[taskId].selectedNodes[i];
            if (nodeTasks[nodeAddress] != 0) {
                nodeTasks[nodeAddress] = 0;
                node.finishTask(nodeAddress);
            }
        }
        delete tasks[taskId];
    }

    function checkTaskResult(uint256 taskId) internal {
        if (tasks[taskId].resultDisclosedRounds.length == 2) {
            // If no node is cheating, we can already give the result back to the user.
            // And free the two honest nodes.
            tasks[taskId].isSuccess = compareRoundResult(taskId, 0, 1);
            if (tasks[taskId].isSuccess) {
                settleNodeByDiscloseIndex(taskId, 1);
                emitTaskFinishedEvent(taskId, 0);
            }
        } else if (tasks[taskId].resultDisclosedRounds.length == 3) {
            if (tasks[taskId].isSuccess) {
                // Task already succeeded. Check the result and finish the task
                if (compareRoundResult(taskId, 0, 2)) {
                    // no one is cheating
                    settleNodeByDiscloseIndex(taskId, 2);
                } else {
                    // 2 is cheating
                    punishNodeByDiscloseIndex(taskId, 2);
                }
            } else {
                if (compareRoundResult(taskId, 0, 2)) {
                    // 1 is cheating
                    settleNodeByDiscloseIndex(taskId, 2);
                    punishNodeByDiscloseIndex(taskId, 1);
                    emitTaskFinishedEvent(taskId, 0);
                } else if (compareRoundResult(taskId, 1, 2)) {
                    // 0 is cheating
                    settleNodeByDiscloseIndex(taskId, 2);
                    punishNodeByDiscloseIndex(taskId, 0);
                    emitTaskFinishedEvent(taskId, 1);
                } else {
                    // 3 different results...
                    // Let's just abort the task for now...
                    abortTask(taskId);
                }
            }

            tryDeleteTask(taskId);
        }
    }

    function emitTaskFinishedEvent(
        uint256 taskId,
        uint honestRoundIndex
    ) internal {
        uint honestRound = tasks[taskId].resultDisclosedRounds[
            honestRoundIndex
        ];
        if (tasks[taskId].results[honestRound].length > 0) {
            // Success task
            tasks[taskId].resultNode = tasks[taskId].selectedNodes[honestRound];

            numSuccessTasks++;
            emit TaskSuccess(
                taskId,
                tasks[taskId].results[honestRound],
                tasks[taskId].selectedNodes[honestRound]
            );
        } else {
            // Aborted task
            settleNodeByDiscloseIndex(taskId, honestRoundIndex);

            numAbortedTasks++;
            emit TaskAborted(taskId, "Task error reported");

            tasks[taskId].aborted = true;
            for (uint i = 0; i < 3; i++) {
                bytes32 commitment = tasks[taskId].commitments[i];
                if (commitment != 0 && commitment != bytes32(uint256(1))) {
                    punishNodeByRound(taskId, i);
                }
            }
            tryDeleteTask(taskId);
        }
    }

    function abortTask(uint256 taskId) internal {
        // Return the task fee to the user
        require(
            cnxToken.transfer(tasks[taskId].creator, taskFeePerNode * 3),
            "Token transfer failed"
        );
        tasks[taskId].balance -= taskFeePerNode * 3;

        // Free the nodes
        for (uint i = 0; i < 3; i++) {
            uint round = tasks[taskId].resultDisclosedRounds[i];
            address nodeAddress = tasks[taskId].selectedNodes[round];
            nodeTasks[nodeAddress] = 0;
            node.finishTask(nodeAddress);
        }

        numAbortedTasks++;
        emit TaskAborted(taskId, "Task result illegal");
        tasks[taskId].aborted = true;
    }

    function compareRoundResult(
        uint256 taskId,
        uint roundIndexA,
        uint roundIndexB
    ) internal view returns (bool) {
        uint taskType = tasks[taskId].taskType;
        uint roundA = tasks[taskId].resultDisclosedRounds[roundIndexA];
        uint roundB = tasks[taskId].resultDisclosedRounds[roundIndexB];

        bytes memory resultA = tasks[taskId].results[roundA];
        bytes memory resultB = tasks[taskId].results[roundB];

        if (taskType == TASK_TYPE_SD) {
            return compareHamming(resultA, resultB, distanceThreshold);
        } else if (taskType == TASK_TYPE_LLM) {
            return keccak256(resultA) == keccak256(resultB);
        } else {
            revert("Invalid task type");
        }
    }

    function settleNodeByRound(uint256 taskId, uint round) internal {
        address nodeAddress = tasks[taskId].selectedNodes[round];
        // Transfer task fee to the node
        require(
            cnxToken.transfer(nodeAddress, taskFeePerNode),
            "Token transfer failed"
        );
        tasks[taskId].balance -= taskFeePerNode;

        // Free the node
        nodeTasks[nodeAddress] = 0;
        node.finishTask(nodeAddress);
    }

    function settleNodeByDiscloseIndex(
        uint256 taskId,
        uint discloseIndex
    ) internal {
        settleNodeByRound(
            taskId,
            tasks[taskId].resultDisclosedRounds[discloseIndex]
        );
    }

    function punishNodeByRound(uint256 taskId, uint round) internal {
        address nodeAddress = tasks[taskId].selectedNodes[round];
        // Transfer task fee to the node
        require(
            cnxToken.transfer(tasks[taskId].creator, taskFeePerNode),
            "Token transfer failed"
        );
        tasks[taskId].balance -= taskFeePerNode;

        // remove node's qos task score
        qos.punish(nodeAddress);

        // Free the node
        nodeTasks[nodeAddress] = 0;
        node.slash(nodeAddress);
    }

    function punishNodeByDiscloseIndex(
        uint256 taskId,
        uint discloseIndex
    ) internal {
        punishNodeByRound(
            taskId,
            tasks[taskId].resultDisclosedRounds[discloseIndex]
        );
    }

    function compareHamming(
        bytes memory a,
        bytes memory b,
        uint threshold
    ) internal pure returns (bool) {
        if (a.length == b.length && a.length % 8 == 0) {
            for (uint start = 0; start < a.length; start += 8) {
                uint distance = Hamming.hamming(a, b, start, start + 8);
                if (distance >= threshold) {
                    return false;
                }
            }
            return true;
        }
        return false;
    }

    function updateTaskFeePerNode(uint256 fee) public onlyOwner {
        taskFeePerNode = fee;
    }

    function updateDistanceThreshold(uint threshold) public onlyOwner {
        distanceThreshold = threshold;
    }

    function updateTimeout(uint t) public onlyOwner {
        timeout = t;
    }

    function getTask(uint256 taskId) public view returns (TaskInfo memory) {
        return tasks[taskId];
    }

    function getNodeTask(address nodeAddress) public view returns (uint256) {
        return nodeTasks[nodeAddress];
    }

    function totalTasks() public view returns (uint256) {
        return nextTaskId - 1;
    }

    function totalSuccessTasks() public view returns (uint256) {
        return numSuccessTasks;
    }

    function totalAbortedTasks() public view returns (uint256) {
        return numAbortedTasks;
    }
}
