const initialState = {
    loading: false
}

const TOGGLE_LOADING = "TOGGLE_LOADING";
const SET_CREDENTIALS = "SET_CREDENTIALS";
const SET_SERVER_INFORMATIONS = "SET_SERVER_INFORMATIONS";

const reducer = (state = initialState, action = {}) => {
    switch (action.type) {
        case SET_SERVER_INFORMATIONS: {
            return {
                ...state,
                serverCpu: action.cpu,
                serverRam: action.ram,
                serverDisk: action.disk,
                serverOS: action.os
            }
        }
        case SET_CREDENTIALS: {
            return {
                ...state,
                username: action.username,
                email: action.email
            }
        }
        case TOGGLE_LOADING: {
            return {
                ...state,
                loading: !state.loading
            }
        }
        default: {
            return state;
        }
    }
}

export const setServerInformations = (cpu, ram, disk, os) => ({
    type: SET_SERVER_INFORMATIONS,
    cpu,
    ram,
    disk,
    os
});

export const setCredentials = (username, email) => ({
    type: SET_CREDENTIALS,
    username,
    email
});

export const toggleLoading = () => ({
    type: TOGGLE_LOADING
});

export default reducer;