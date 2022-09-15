import client from "../../axiosConfig";

const getDomainsMiddleware = store => next => action => {

    if( action.type === "GET_DOMAINS") {
        client.get('/api/domains')
            .catch(error => console.log(error))
            .then(response => store.dispatch({
                type: "SET_DOMAINS",
                domains: response.data.data
            }))
    }
    return next(action);
    
}

export default getDomainsMiddleware;