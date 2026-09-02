const url = `http://127.0.0.1:${process.env.PORT || 3000}/health`;
const response = await fetch(url).catch(() => null);
if (!response || !response.ok) process.exit(1);
console.log('THANXIE AI healthy');
