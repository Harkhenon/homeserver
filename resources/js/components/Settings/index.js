import React from 'react';
import { toast } from 'react-toastify';

const Settings = (props) =>  {

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
                    <form>
                        <div className="col s12 m12 l6 xl6 push-l3 push-xl3">
                            <h3>Server settings</h3>
                            <div className="input-field">
                                <input type="url" name="hostname" id="hostname" />
                                <label htmlFor="hostname">Hostname</label>
                            </div>
                            <div className="input-field">
                                <input type="url" name="domain" id="domain" />
                                <label htmlFor="domain">Server domain</label>
                            </div>
                            <div className="input-field">
                                <input type="email" name="mainemail" id="mainemail" />
                                <label htmlFor="mainemail">Main admin email</label>
                            </div>
                        </div>
                    </form>
                </div>
            </div>
        </main>
    )
}

export default Settings;
