async function testLogin() {
    const url = 'https://solvanta-business-suite-server.vercel.app/api/v1/auth/login';
    const payload = {
        email: 'mhassantoha@gmail.com',
        password: 'Aas112233@'
    };
    
    console.log('Sending login request to:', url);
    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Origin': 'https://solvanta-business-suite-server-ub4d.vercel.app'
            },
            body: JSON.stringify(payload)
        });
        
        console.log('Response Status:', response.status);
        
        const text = await response.text();
        console.log('Response Body:');
        try {
            console.log(JSON.stringify(JSON.parse(text), null, 2));
        } catch {
            console.log(text);
        }
    } catch (error) {
        console.error('Error during fetch:', error);
    }
}

testLogin();
