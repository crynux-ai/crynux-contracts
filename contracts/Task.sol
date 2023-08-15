// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.18;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

import "./Node.sol";

contract Task is Ownable {

    struct TaskInfo {
        uint256 id;
        address creator;
        bytes32 taskHash;
        bytes32 dataHash;
        bool isSuccess;
        address [] selectedNodes;
        bytes32 [] commitments;
        bytes32 [] nonces;
        bytes [] results;
        uint [] resultDisclosedRounds;
    }

    Node private node;
    IERC20 private cnxToken;
    mapping(uint => TaskInfo) private tasks;
    mapping(address => uint256) private nodeTasks;
    uint256 private nextTaskId;
    uint256 private totalTasks;
    uint256 private taskFeePerNode;
    uint private distanceThreshold;

    event TaskCreated(uint256 taskId, address indexed creator, address indexed selectedNode, bytes32 taskHash, bytes32 dataHash, uint round);
    event TaskResultCommitmentsReady(uint256 taskId);
    event TaskSuccess(uint256 taskId, bytes result, address indexed resultNode);
    event TaskAborted(uint256 taskId);

    constructor(Node nodeInstance, IERC20 tokenInstance) {
        node = nodeInstance;
        cnxToken = tokenInstance;
        taskFeePerNode = 10 * 10 ** 18;
        nextTaskId = 1;
        distanceThreshold = 5;
    }

    function createTask(bytes32 taskHash, bytes32 dataHash) public {

        uint256 taskFee = taskFeePerNode * 3;

        require(cnxToken.balanceOf(msg.sender) >= taskFee, "Not enough tokens for task");
        require(cnxToken.allowance(msg.sender, address(this)) >= taskFee, "Not enough allowance for task");
        require(node.availableNodes() >= 3, "Not enough nodes");

        require(
            cnxToken.transferFrom(msg.sender, address(this), taskFee),
            "Task fee payment failed"
        );

        TaskInfo memory taskInfo;

        taskInfo.id = nextTaskId++;
        taskInfo.creator = msg.sender;
        taskInfo.taskHash = taskHash;
        taskInfo.dataHash = dataHash;
        taskInfo.isSuccess = false;
        taskInfo.commitments = new bytes32[](3);
        taskInfo.nonces = new bytes32[](3);
        taskInfo.results = new bytes[](3);

        tasks[taskInfo.id] = taskInfo;

        for(uint i=0; i<3; i++) {
            address nodeAddress = getSelectedNode(taskHash, dataHash, i);
            tasks[taskInfo.id].selectedNodes.push(nodeAddress);
            node.updateNodeAvailabilityByTask(nodeAddress, 2);
            nodeTasks[nodeAddress] = taskInfo.id;
            emit TaskCreated(taskInfo.id, msg.sender, nodeAddress, taskHash, dataHash, i);
        }
    }

    function getSelectedNode(bytes32 taskHash, bytes32 dataHash, uint round) view public returns (address) {
        bytes32 blockRand = keccak256(abi.encodePacked(block.prevrandao, round));
        uint256 randNum = uint256(blockRand ^ taskHash ^ dataHash) % node.totalNodes();
        return node.getAvailableNodeStartsFrom(randNum);
    }

    function submitTaskResultCommitment(uint256 taskId, uint round, bytes32 commitment, bytes32 nonce) public {
        require(tasks[taskId].id != 0, "Task not exist");
        require(round >= 0 && round < 3, "Round not exist");
        require(tasks[taskId].selectedNodes[round] == msg.sender, "Not selected node");
        require(tasks[taskId].commitments[round] == 0, "Already submitted");

        require(
            nonce != tasks[taskId].nonces[0]
            && nonce != tasks[taskId].nonces[1]
            && nonce != tasks[taskId].nonces[2],
            "Nonce already used"
        );

        tasks[taskId].commitments[round] = commitment;
        tasks[taskId].nonces[round] = nonce;

        if (tasks[taskId].commitments[0] != 0
            && tasks[taskId].commitments[1] != 0
            && tasks[taskId].commitments[2] != 0) {
            emit TaskResultCommitmentsReady(taskId);
        }
    }

    function discloseTaskResult(uint256 taskId, uint round, bytes calldata result) public {
        require(tasks[taskId].id != 0, "Task not exist");
        require(round >= 0 && round < 3, "Round not exist");
        require(tasks[taskId].selectedNodes[round] == msg.sender, "Not selected node");
        require(tasks[taskId].results[round].length == 0, "Already submitted");
        require(tasks[taskId].commitments[0] != 0
            && tasks[taskId].commitments[1] != 0
            && tasks[taskId].commitments[2] != 0,
            "Commitments not ready"
        );

        require(
            tasks[taskId].commitments[round] ==
                keccak256(abi.encodePacked(result, tasks[taskId].nonces[round])),
            "Mismatch result and commitment"
        );

        tasks[taskId].results[round] = result;
        tasks[taskId].resultDisclosedRounds.push(round);

        if (tasks[taskId].resultDisclosedRounds.length == 2) {

            // If no node is cheating, we can already give the result back to the user.
            // And free the two honest nodes.
            tasks[taskId].isSuccess = compareRound(taskId, 0, 1);
            if(tasks[taskId].isSuccess) {
                settleNodeByDiscloseIndex(taskId, 0);
                settleNodeByDiscloseIndex(taskId, 1);
                emit TaskSuccess(
                    taskId,
                    tasks[taskId].results[tasks[taskId].resultDisclosedRounds[0]],
                    tasks[taskId].selectedNodes[tasks[taskId].resultDisclosedRounds[0]]);
            }

        } else if(tasks[taskId].resultDisclosedRounds.length == 3) {
            if(tasks[taskId].isSuccess) {
                // Task already succeeded. Check the result and finish the task
                if(compareRound(taskId, 0, 2)) {
                    // no one is cheating
                    settleNodeByDiscloseIndex(taskId, 2);
                } else {
                    // 2 is cheating
                    punishNodeByDiscloseIndex(taskId, 2);
                }
            } else {
                if(compareRound(taskId, 0, 2)) {
                    // 1 is cheating
                    settleNodeByDiscloseIndex(taskId, 0);
                    settleNodeByDiscloseIndex(taskId, 2);
                    punishNodeByDiscloseIndex(taskId, 1);
                    emit TaskSuccess(
                        taskId,
                        tasks[taskId].results[tasks[taskId].resultDisclosedRounds[0]],
                        tasks[taskId].selectedNodes[tasks[taskId].resultDisclosedRounds[0]]
                    );
                } else if(compareRound(taskId, 1, 2)) {
                    // 0 is cheating
                    settleNodeByDiscloseIndex(taskId, 1);
                    settleNodeByDiscloseIndex(taskId, 2);
                    punishNodeByDiscloseIndex(taskId, 0);
                    emit TaskSuccess(
                        taskId,
                        tasks[taskId].results[tasks[taskId].resultDisclosedRounds[1]],
                        tasks[taskId].selectedNodes[tasks[taskId].resultDisclosedRounds[1]]
                    );
                } else {
                    // 3 different results...
                    // Let's just abort the task for now...
                    abortTask(taskId);
                }
            }

            delete tasks[taskId];
        }
    }

    function abortTask(uint256 taskId) internal {

        // Return the task fee to the user
        require(
            cnxToken.transfer(tasks[taskId].creator, taskFeePerNode * 3),
            "Token transfer failed"
        );

        // Free the nodes
        for(uint i=0; i<3; i++) {
            uint round = tasks[taskId].resultDisclosedRounds[i];
            address nodeAddress = tasks[taskId].selectedNodes[round];
            nodeTasks[nodeAddress] = 0;
            node.updateNodeAvailabilityByTask(nodeAddress, 1);
        }

        emit TaskAborted(taskId);
    }

    function compareRound(uint256 taskId, uint roundIndexA, uint roundIndexB) view internal returns (bool) {
        uint roundA = tasks[taskId].resultDisclosedRounds[roundIndexA];
        uint roundB = tasks[taskId].resultDisclosedRounds[roundIndexB];

        bytes memory resultA = tasks[taskId].results[roundA];
        bytes memory resultB = tasks[taskId].results[roundB];

        return compareResult(resultA, resultB, distanceThreshold);
    }

    function settleNodeByDiscloseIndex(uint256 taskId, uint discloseIndex) internal {
        address nodeAddress = tasks[taskId].selectedNodes[tasks[taskId].resultDisclosedRounds[discloseIndex]];

        // Transfer task fee to the node
        require(
            cnxToken.transfer(nodeAddress, taskFeePerNode),
            "Token transfer failed"
        );

        // Free the node
        nodeTasks[nodeAddress] = 0;
        node.updateNodeAvailabilityByTask(nodeAddress, 1);
    }

    function punishNodeByDiscloseIndex(uint256 taskId, uint discloseIndex) internal {

        // Return the task fee to user
        require(
            cnxToken.transfer(tasks[taskId].creator, taskFeePerNode),
            "Token transfer failed"
        );

        address nodeAddress = tasks[taskId].selectedNodes[tasks[taskId].resultDisclosedRounds[discloseIndex]];
        nodeTasks[nodeAddress] = 0;

        node.slash(nodeAddress);
    }

    function compareResult(bytes memory a, bytes memory b, uint threshold) internal pure returns (bool) {
        if (a.length == b.length) {
            uint distance = 0;
            for (uint i = 0; i < a.length; i++) {
                distance += hamming(a[i], b[i]);
            }
            return distance < threshold;
        }
        return false;
    }

    function hamming(bytes1 a, bytes1 b) internal pure returns (uint8) {
        uint8 c = uint8(a ^ b);
        uint8 res = 0;
        while (c > 0) {
            res += c ^ 1;
            c = c >> 1;
        }
        return res;
    }

    function updateTaskFeePerNode(uint256 fee) public onlyOwner {
        taskFeePerNode = fee;
    }

    function updateDistanceThreshold(uint threshold) public onlyOwner {
        distanceThreshold = threshold;
    }

    function getTask(uint256 taskId) public view returns (TaskInfo memory) {
        return tasks[taskId];
    }

    function getNodeTask(address nodeAddress) public view returns (uint256) {
        return nodeTasks[nodeAddress];
    }
}
