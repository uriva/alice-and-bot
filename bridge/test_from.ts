const dataBase64 = "CgD2/w==";
const u8 = Uint8Array.from(atob(dataBase64), (char) => char.charCodeAt(0));
const outArr = new Int16Array(u8.buffer);
console.log(outArr);
