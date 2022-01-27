import React, { useEffect } from 'react';
import { toast } from 'react-toastify';
import { client } from '../../store';

const Settings = (props) =>  {

    const {
        serverHostname,
        serverDomain,
        serverMainemail, 
        serverIp,
        controlFormInput,
        controlFormErrors
    } = props;

    useEffect(() => {
        if(serverHostname, serverDomain, serverMainemail, serverIp === "") {
            client.get('/api/server/config')
                .then(response => {
                    controlFormInput("serverHostname", response.data.shortHostname);
                    controlFormInput("serverDomain", response.data.hostname);
                    controlFormInput("serverIp", response.data.hostnameIp);
                })
                .catch(errors => {
                    console.log(errors);
                })
            }
    })

    const handleStop = () => {
        /* Stops the server after verifications */
        toast.success('Successfuly stop the server')
    }

    const handleRestart = () => {
        /* Restarts the server after verifications */
        toast.success('Successfully restart the server')
    }

    const handleForm = (e) => {
        e.preventDefault();
        console.log(e.target[1].value)
    }

    const handleChange = (e) => {
        const { name, value } = e.target;
        controlFormInput(name, value);
    }

    return (
        <main>
            <div className="settings">
                <div className="row">
                    <h3>Server commands</h3>
                    <div className="col s4 m4 l2 xl2 push-s2 push-m2 push-l4 push-xl4">
                        <button className="btn red" onClick={handleStop}>Stop</button>
                    </div>
                    <div className="col s4 m4 l2 xl2 push-s2 push-m2 push-l4 push-xl4">
                        <button className="btn orange" onClick={handleRestart}>Restart</button>
                    </div>
                </div>
                <div className="row">
                    <form onSubmit={handleForm}>
                        <div className="col s12 m12 l6 xl6 push-l3 push-xl3">
                            <h3>Server settings</h3>
                            <div className="input-field">
                                <button type="submit" className="btn">
                                    <i className="material-icons left">save</i>
                                    Save configuration
                                </button>
                            </div>
                            <div className="input-field">
                                <input
                                    type="text"
                                    name="serverHostname"
                                    id="hostname" 
                                    defaultValue={serverHostname}
                                    onChange={handleChange}
                                />
                                <label htmlFor="hostname">Hostname</label>
                            </div>
                            <div className="input-field">
                                <input
                                    type="text"
                                    name="serverDomain"
                                    id="domain" 
                                    defaultValue={serverDomain}
                                    onChange={handleChange}
                                />
                                <label htmlFor="domain">Server domain</label>
                            </div>
                            <div className="input-field">
                                <input
                                    type="email"
                                    name="serverMainemail"
                                    id="mainemail"
                                    defaultValue={serverMainemail}
                                    onChange={handleChange}
                                />
                                <label htmlFor="mainemail">Admin E-Mail</label>
                            </div>
                            <div className="input-field">
                                <input
                                    type="text"
                                    name="serverIp"
                                    id="ip"
                                    defaultValue={serverIp}
                                    onChange={handleChange}
                                />
                                <label htmlFor="ip">Server IP</label>
                                <p className="chip red white-text">
                                    <i className="material-icons left">warning</i>
                                    Be careful, wrong IP can broke the server!
                                </p>
                            </div>
                        </div>
                    </form>
                </div>
            </div>
        </main>
    )
}

export default Settings;
