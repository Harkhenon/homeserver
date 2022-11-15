import axios from 'axios';

// all axios can be used, shown in axios documentation
const client = axios.create({
    baseURL: import.meta.env.MIX_APP_URL,
    responseType: 'json',
    headers: {
      'Content-Type': 'application/ld+json; charset=utf-8',
      'Authorization': 'Bearer ' + localStorage.getItem('userToken'),
    },
  });

  export default client;
  