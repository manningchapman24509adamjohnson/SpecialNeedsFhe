// SpecialNeedsFhe.sol
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { FHE, euint32, ebool } from "@fhevm/solidity/lib/FHE.sol";
import { SepoliaConfig } from "@fhevm/solidity/config/ZamaConfig.sol";

contract SpecialNeedsFhe is SepoliaConfig {
    struct EncryptedStudentData {
        uint256 id;
        euint32 encryptedLearningStyle;
        euint32 encryptedBehaviorPatterns;
        euint32 encryptedProgressMetrics;
        uint256 timestamp;
    }
    
    struct PersonalizedPlan {
        euint32 encryptedTeachingMethod;
        euint32 encryptedDifficultyLevel;
        euint32 encryptedPacingScore;
    }

    struct DecryptedStudentData {
        string learningStyle;
        string behaviorPatterns;
        string progressMetrics;
        bool isRevealed;
    }

    uint256 public studentCount;
    mapping(uint256 => EncryptedStudentData) public encryptedStudentData;
    mapping(uint256 => DecryptedStudentData) public decryptedStudentData;
    mapping(uint256 => PersonalizedPlan) public personalizedPlans;
    
    mapping(uint256 => uint256) private requestToStudentId;
    
    event StudentDataSubmitted(uint256 indexed id, uint256 timestamp);
    event AnalysisRequested(uint256 indexed studentId);
    event PlanGenerated(uint256 indexed studentId);
    event DecryptionRequested(uint256 indexed studentId);
    event StudentDataDecrypted(uint256 indexed studentId);
    
    modifier onlyEducator(uint256 studentId) {
        _;
    }
    
    function submitEncryptedStudentData(
        euint32 encryptedLearningStyle,
        euint32 encryptedBehaviorPatterns,
        euint32 encryptedProgressMetrics
    ) public {
        studentCount += 1;
        uint256 newId = studentCount;
        
        encryptedStudentData[newId] = EncryptedStudentData({
            id: newId,
            encryptedLearningStyle: encryptedLearningStyle,
            encryptedBehaviorPatterns: encryptedBehaviorPatterns,
            encryptedProgressMetrics: encryptedProgressMetrics,
            timestamp: block.timestamp
        });
        
        decryptedStudentData[newId] = DecryptedStudentData({
            learningStyle: "",
            behaviorPatterns: "",
            progressMetrics: "",
            isRevealed: false
        });
        
        emit StudentDataSubmitted(newId, block.timestamp);
    }
    
    function requestStudentDataDecryption(uint256 studentId) public onlyEducator(studentId) {
        EncryptedStudentData storage data = encryptedStudentData[studentId];
        require(!decryptedStudentData[studentId].isRevealed, "Already decrypted");
        
        bytes32[] memory ciphertexts = new bytes32[](3);
        ciphertexts[0] = FHE.toBytes32(data.encryptedLearningStyle);
        ciphertexts[1] = FHE.toBytes32(data.encryptedBehaviorPatterns);
        ciphertexts[2] = FHE.toBytes32(data.encryptedProgressMetrics);
        
        uint256 reqId = FHE.requestDecryption(ciphertexts, this.decryptStudentData.selector);
        requestToStudentId[reqId] = studentId;
        
        emit DecryptionRequested(studentId);
    }
    
    function decryptStudentData(
        uint256 requestId,
        bytes memory cleartexts,
        bytes memory proof
    ) public {
        uint256 studentId = requestToStudentId[requestId];
        require(studentId != 0, "Invalid request");
        
        EncryptedStudentData storage eData = encryptedStudentData[studentId];
        DecryptedStudentData storage dData = decryptedStudentData[studentId];
        require(!dData.isRevealed, "Already decrypted");
        
        FHE.checkSignatures(requestId, cleartexts, proof);
        
        string[] memory results = abi.decode(cleartexts, (string[]));
        
        dData.learningStyle = results[0];
        dData.behaviorPatterns = results[1];
        dData.progressMetrics = results[2];
        dData.isRevealed = true;
        
        emit StudentDataDecrypted(studentId);
    }
    
    function requestPersonalizedPlan(uint256 studentId) public onlyEducator(studentId) {
        require(encryptedStudentData[studentId].id != 0, "Student not found");
        
        emit AnalysisRequested(studentId);
    }
    
    function submitPersonalizedPlan(
        uint256 studentId,
        euint32 encryptedTeachingMethod,
        euint32 encryptedDifficultyLevel,
        euint32 encryptedPacingScore
    ) public {
        personalizedPlans[studentId] = PersonalizedPlan({
            encryptedTeachingMethod: encryptedTeachingMethod,
            encryptedDifficultyLevel: encryptedDifficultyLevel,
            encryptedPacingScore: encryptedPacingScore
        });
        
        emit PlanGenerated(studentId);
    }
    
    function requestPlanDecryption(uint256 studentId, uint8 planComponent) public onlyEducator(studentId) {
        PersonalizedPlan storage plan = personalizedPlans[studentId];
        require(FHE.isInitialized(plan.encryptedTeachingMethod), "No plan available");
        
        bytes32[] memory ciphertexts = new bytes32[](1);
        
        if (planComponent == 0) {
            ciphertexts[0] = FHE.toBytes32(plan.encryptedTeachingMethod);
        } else if (planComponent == 1) {
            ciphertexts[0] = FHE.toBytes32(plan.encryptedDifficultyLevel);
        } else if (planComponent == 2) {
            ciphertexts[0] = FHE.toBytes32(plan.encryptedPacingScore);
        } else {
            revert("Invalid plan component");
        }
        
        uint256 reqId = FHE.requestDecryption(ciphertexts, this.decryptPlanComponent.selector);
        requestToStudentId[reqId] = studentId * 10 + planComponent;
    }
    
    function decryptPlanComponent(
        uint256 requestId,
        bytes memory cleartexts,
        bytes memory proof
    ) public {
        uint256 compositeId = requestToStudentId[requestId];
        uint256 studentId = compositeId / 10;
        uint8 planComponent = uint8(compositeId % 10);
        
        FHE.checkSignatures(requestId, cleartexts, proof);
        
        string memory result = abi.decode(cleartexts, (string));
    }
    
    function getDecryptedStudentData(uint256 studentId) public view returns (
        string memory learningStyle,
        string memory behaviorPatterns,
        string memory progressMetrics,
        bool isRevealed
    ) {
        DecryptedStudentData storage s = decryptedStudentData[studentId];
        return (s.learningStyle, s.behaviorPatterns, s.progressMetrics, s.isRevealed);
    }
    
    function hasPersonalizedPlan(uint256 studentId) public view returns (bool) {
        return FHE.isInitialized(personalizedPlans[studentId].encryptedTeachingMethod);
    }
}