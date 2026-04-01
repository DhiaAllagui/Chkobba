const io = require("socket.io-client");

const hostSocket = io("http://localhost:3000");
const guestSocket = io("http://localhost:3000");

let partyCode;

hostSocket.on("connect", () => {
    console.log("Host connected");
    hostSocket.emit("create-party", { name: "HostTest", sessionToken: "host_token" });
});

hostSocket.on("party-created", (data) => {
    partyCode = data.code;
    console.log("Party created with code:", partyCode);
    
    // Now guest joins
    guestSocket.emit("join-party", { code: partyCode, name: "GuestTest", sessionToken: "guest_token" });
});

guestSocket.on("join-success", () => {
    console.log("Guest joined successfully.");
    
    // Now host leaves
    setTimeout(() => {
        console.log("Host leaving party...");
        hostSocket.emit("leave-room");
    }, 1000);
});

guestSocket.on("room-closed", (data) => {
    console.log("Guest received room-closed:", data);
    process.exit(0);
});

guestSocket.on("player-disconnected", (data) => {
    console.log("Guest received player-disconnected:", data);
});

guestSocket.on("disconnect", () => {
    console.log("Guest socket disconnected.");
});
