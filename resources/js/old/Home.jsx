import React from 'react';
import { Loader } from 'semantic-ui-react';
import { toast } from 'react-toastify';

import '@sass/Home.scss';
import client from '@js/axiosConfig';
import MainMenu from '@src/MainMenu';

class Home extends React.Component {

    constructor(props) {
        super(props);
    }

    getServerInformations(
        serverCpu,
        serverRam,
        serverDisk,
        serverOs,
        serverTemp
    ) {
        client.get('api/server/informations')
        .catch((error) => {
            toast.error('Unable to reach server informations');
        })
        .then((response) => {

            const { cpuUsage, ramUsage, diskUsage, os: osUsed, temp } = response.data;
            const { setServerInformations } = this.props;

            const cpu = document.querySelector('.machine-cpu');
            const ram = document.querySelector('.machine-ram');
            const disk = document.querySelector('.machine-disk');
            const temperature = document.querySelector('.machine-temp');
            const platform = document.querySelector('#platform > h4');
            const cpuText = document.querySelector('.cpu .load');
            const ramText = document.querySelector('.ram .load');
            const diskText = document.querySelector('.disk .load');
            const temperatureText = document.querySelector('.temp .load');

            platform.textContent = (serverOs ??= osUsed);

            cpuText.textContent = Math.round(serverCpu ??= cpuUsage) + "%";
            ramText.textContent = Math.round(serverRam ??= ramUsage) + "%";
            diskText.textContent = Math.round(serverDisk ??= diskUsage) + "%";
            temperatureText.textContent = (serverTemp ??= temp) + "°C";

            if(document.querySelector('.machine-disk .ui.loader')) {
                document.querySelector('.machine-cpu .ui.loader').remove();
                document.querySelector('.machine-ram .ui.loader').remove();
                document.querySelector('.machine-disk .ui.loader').remove();
                document.querySelector('.machine-temp .ui.loader').remove();
            }
            
            const realCPU = (cpuUsage ? cpuUsage : serverCpu);
            const realRAM = (serverRam ??= ramUsage);
            const realDISK = (serverDisk ??= diskUsage);
            const realTEMP = (serverTemp ??= temp);

            cpu.style.background = `conic-gradient(
                greenyellow ${realCPU * 3.6}deg,
                #000 ${realCPU * 3.6}deg 
            )`;
            ram.style.background = `conic-gradient(
                greenyellow ${realRAM * 3.6}deg,
                #000 ${realRAM * 3.6}deg 
            )`;
            disk.style.background = `conic-gradient(
                greenyellow ${realDISK * 3.6}deg,
                #000 ${realDISK * 3.6}deg 
            )`;
            temperature.style.background = `conic-gradient(
                greenyellow ${realTEMP * 3.6}deg,
                #000 ${realTEMP * 3.6}deg 
            )`;
            setServerInformations(cpuUsage, ramUsage, diskUsage, osUsed, temp);
        })
    }
    
    componentDidMount() {
        const {
            serverCpu,
            serverRam,
            serverDisk,
            serverOs,
            serverTemp,
            storeData,
            settings
        } = this.props;

        if(serverCpu, serverRam, serverDisk, serverOs, serverTemp === null) {
            this.getServerInformations()
        }

        let intervalId = setInterval(() => {this.getServerInformations(
            serverCpu,
            serverRam,
            serverDisk,
            serverOs,
            serverTemp
        )}, 3000);

        storeData("settings", {
            ...settings,
            intervalId
        });
    };

    componentWillUnmount() {
        const { settings } = this.props;
        clearInterval(settings['intervalId']);
    }

    render() {

        const { settings } = this.props;
        return (
            <main>
                <div id="presentation">
                    <h3>PLATFORM</h3>
                    <div id="platform">
                        <h4>
                            <Loader
                                active
                            />
                        </h4>
                    </div>
                </div>
                <div id="main-table" className="row">
                    <div className="machine-container cpu">
                        <div className="machine-cpu circle-load">
                            <Loader
                                active
                                size="small"
                                color="green"
                            />
                        </div>
                        <div className="load"></div>
                    </div>
                    <div className="machine-container ram">
                        <div className="machine-ram circle-load">
                            <Loader
                                active
                                size="small"
                                color="green"
                            />
                        </div>
                        <div className="load"></div>
                    </div>
                    <div className="machine-container disk">
                        <div className="machine-disk circle-load">
                            <Loader
                                active
                                size="small"
                                color="green"
                            />
                        </div>
                        <div className="load"></div>
                    </div>
                    <div className="machine-container temp">
                        <div className="machine-temp circle-load">
                            <Loader
                                active
                                size="small"
                                color="green"
                            />
                        </div>
                        <div className="load"></div>
                    </div>
                </div>
                <MainMenu />
            </main>
    )
    }
};

export default Home;
