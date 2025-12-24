const functions = require("firebase-functions");
const fetch = require("node-fetch"); 
const cors = require("cors")({origin: true});

// Securely store your key here, or use firebase environment config
const RAWG_API_KEY = "e5fe5c904b9d4a518083fbb724b406b7"; 

exports.searchGames = functions.https.onRequest((req, res) => {
  // 1. Enable CORS (allows your React app to call this function)
  cors(req, res, async () => {
    
    // 2. Get the search query and optional filters from the request
    const query = req.query.search;
    const ordering = req.query.ordering;
    const page_size = req.query.page_size;
    const dates = req.query.dates;
    const platforms = req.query.platforms;
    
    try {
      // 3. Call RAWG API from the server (Key remains hidden here)
      const params = new URLSearchParams();
      params.append("key", RAWG_API_KEY);
      if (query) params.append("search", query);
      if (ordering) params.append("ordering", ordering);
      params.append("page_size", page_size || 10);
      if (dates) params.append("dates", dates);
      if (platforms) params.append("platforms", platforms);
      const response = await fetch(`https://api.rawg.io/api/games?${params.toString()}`);
      const data = await response.json();

      // 4. Send the results back to your React App
      res.json(data);
      
    } catch (error) {
      console.error("Error fetching games:", error);
      res.status(500).json({error: "Internal Server Error"});
    }
  });
});
