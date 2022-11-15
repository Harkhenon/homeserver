const initialState = {
    settings: {
        loading: false,
        sidebarVisibility: false
    }
}

const TOGGLE_LOADING = "TOGGLE_LOADING";
const SET_CREDENTIALS = "SET_CREDENTIALS";
const SET_SERVER_INFORMATIONS = "SET_SERVER_INFORMATIONS";
const CONTROL_FORM_INPUT = "CONTROL_FORM_INPUT";
const CONTROL_FORM_ERRORS = "CONTROL_FORM_ERRORS";
const STORE_DATA = "STORE_DATA";
const SET_SIDEBAR_VISIBILITY = "SET_SIDEBAR_VISIBILITY";
const GET_DOMAINS = "GET_DOMAINS";
const SET_DOMAINS = "SET_DOMAINS";

const reducer = (state = initialState, action = {}) => {
    switch (action.type) {
        case CONTROL_FORM_INPUT: {
            return {
                ...state,
                inputs: {
                    ...state.inputs,
                    [action.key]: action.value,
                }
            }
        }
        case CONTROL_FORM_ERRORS: {
            return {
                ...state,
                form_errors: action.errors,
            }
        }
        case SET_SERVER_INFORMATIONS: {
            return {
                ...state,
                serverCpu: action.cpu,
                serverRam: action.ram,
                serverDisk: action.disk,
                serverOS: action.os,
                serverTemp: action.temp
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
        case STORE_DATA: {
            return {
                ...state,
                [action.name]: action.data,
            }
        }
        case GET_DOMAINS: {
            return {
                ...state,
            }
        }
        case SET_DOMAINS: {
            return {
                ...state,
                domains: action.domains
            }
        }
        case SET_SIDEBAR_VISIBILITY: {
            return {
                ...state,
                settings: {
                    ...state.settings,
                    sidebarVisibility: !state.settings.sidebarVisibility
                }
            }
        }
        default: {
            return state;
        }
    }
}

export const getDomains = () => ({
    type: GET_DOMAINS
});

export const setServerInformations = (cpu, ram, disk, os, temp) => ({
    type: SET_SERVER_INFORMATIONS,
    cpu,
    ram,
    disk,
    os,
    temp
});

export const setCredentials = (username, email) => ({
    type: SET_CREDENTIALS,
    username,
    email
});

export const toggleLoading = () => ({
    type: TOGGLE_LOADING
});

export const controlFormInput = (key, value) => ({
    type: CONTROL_FORM_INPUT,
    key,
    value
});

export const controlFormErrors = (errors) => ({
    type: CONTROL_FORM_ERRORS,
    errors
});

export const storeData = (name, data) => ({
    type: STORE_DATA,
    name,
    data
});

export const setSidebarVisibility = () => ({
    type: SET_SIDEBAR_VISIBILITY
});

export default reducer;