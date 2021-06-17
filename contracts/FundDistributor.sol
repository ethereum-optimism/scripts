pragma solidity 0.7.6;

contract FundDistributor {
    address public owner;
    mapping (address => bool) public approved;

    constructor() {
        owner = msg.sender;
    }

    function balance() public view returns (uint256) {
        return address(this).balance;
    }

    function deposit() public payable {}

    function approve(address[] memory _addresses) public {
        require(msg.sender == owner);
        for (uint256 i = 0; i < _addresses.length; i++) {
            approved[_addresses[i]] = true;
        }
    }

    function withdraw(uint256 _amount) public {
        require(msg.sender == owner || approved[msg.sender], "sender not allowed");
        msg.sender.call{value: _amount}("");
    }
}
