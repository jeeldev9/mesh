const axios = require('axios');

// Define the API endpoint
const apiUrl = 'https://api.meshchain.ai/meshmain/rewards/estimate'; // Replace with your actual API URL

// Define the function to call the API
async function callApi() {
    try {
        // Define the headers
        const headers = {
            'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIyN0JVUldEOVY1SDYiLCJqdGkiOiI4ZmNkNmUyNy00Y2Y1LTRmNDgtYjQ3My1mZWFmNGVlYjE2NjgiLCJpYXQiOjE3MzcyNzcxMTUsImV4cCI6MTczNzI4MDcxNX0.g8VoOddyDbrvaKI087ZI1Ipk5-rKOHZmjsFB9r1CMww', // Replace with your token
            'Content-Type': 'application/json',
            'Custom-Header': 'HeaderValue' // Add any custom headers if needed
        };

        // Define the payload (body of the POST request)
        const data = {
          "unique_id":"bbc13e0bb0f2ff30e6e01b29a6c67824"
        };

        // Make the POST request to the API
        const response = await axios.post(apiUrl, data, { headers });

        // Handle the response
        if (response.status === 200 || response.status===201) {
            console.log('API call successful');
            // console.log('Response:', response.data);
            if(response.data['filled']==true){
              console.log("Claimable");
              claimReward();
            }else{
              console.log("Not Claimable");
            }
        } else {
            console.log(`API call failed with status code: ${response.status}`);
        }
    } catch (error) {
        console.error('An error occurred:', error);
    }
}


async function claimReward() {
  try {
      // Define the headers
      const headers = {
          'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIyN0JVUldEOVY1SDYiLCJqdGkiOiI4ZmNkNmUyNy00Y2Y1LTRmNDgtYjQ3My1mZWFmNGVlYjE2NjgiLCJpYXQiOjE3MzcyNzcxMTUsImV4cCI6MTczNzI4MDcxNX0.g8VoOddyDbrvaKI087ZI1Ipk5-rKOHZmjsFB9r1CMww', // Replace with your token
          'Content-Type': 'application/json',
          'Custom-Header': 'HeaderValue' // Add any custom headers if needed
      };

      // Define the payload (body of the POST request)
      const data = {
        "unique_id":"bbc13e0bb0f2ff30e6e01b29a6c67824"
      };

      // Make the POST request to the API
      const response = await axios.post("https://api.meshchain.ai/meshmain/rewards/claim", data, { headers });

      // Handle the response
      if (response.status === 200 || response.status===201) {
          console.log('API call successful');
          // console.log('Response:', response.data);
          
            console.log("Reward Claimed");
          
      } else {
          console.log(`API call failed with status code: ${response.status}`);
      }
  } catch (error) {
      console.error('An error occurred:', error);
  }
}

// Call the API every 10 seconds using setInterval
setInterval(() => {
    console.log('Making API call...');
    callApi();
}, 600000); // 300000 ms = 5 MIN

console.log('API will be called every 10 MIN.');
