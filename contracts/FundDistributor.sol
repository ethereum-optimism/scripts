pragma solidity 0.7.6;

contract FundDistributor {
    address public owner;

    constructor() {
        owner = msg.sender;
    }

    function deposit() public payable {}

    function distribute(address[] memory _addresses) public payable {
        for (uint256 i = 0; i < _addresses.length; i++) {
            _addresses[i].call{value: msg.value / _addresses.length}("");
        }
    }

    function withdraw() public {
        require(msg.sender == owner);
        msg.sender.call{value: address(this).balance}("");
    }
}
