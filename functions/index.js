const functions = require("firebase-functions");
const fetch = require("node-fetch"); 
const cors = require("cors")({origin: true});

// Securely store your key here, or use firebase environment config
const RAWG_API_KEY = "e5fe5c904b9d4a518083fbb724b406b7"; 

exports.searchGames = functions.https.onRequest((req, res) => {
  // 1. Enable CORS (allows your React app to call this function)
  cors(req, res, async () => {
    
    // 2. Get the search query from the request
    const query = req.query.search;
    
    if (!query) {
      return res.status(400).json({error: "Missing search query"});
    }

    try {
      // 3. Call RAWG API from the server (Key remains hidden here)
      const response = await fetch(
        `https://api.rawg.io/api/games?key=${RAWG_API_KEY}&search=${encodeURIComponent(query)}&page_size=10`
      );
      const data = await response.json();

      // 4. Send the results back to your React App
      res.json(data);
      
    } catch (error) {
      console.error("Error fetching games:", error);
      res.status(500).json({error: "Internal Server Error"});
    }
  });
});