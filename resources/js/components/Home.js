import React from 'react';
import { Preloader } from 'react-materialize';
import { toast } from 'react-toastify';

import { client } from '../store';
import './scss/Home.scss';

class Home extends React.Component {

    constructor(props) {
        super(props);
        toast.configure();
        
    }

    getRotationDegrees(obj) {
        var matrix = obj.css("-webkit-transform") ||
        obj.css("-moz-transform")    ||
        obj.css("-ms-transform")     ||
        obj.css("-o-transform")      ||
        obj.css("transform");
        if(matrix !== 'none') {
            var values = matrix.split('(')[1].split(')')[0].split(',');
            var a = values[0];
            var b = values[1];
            var angle = Math.round(Math.atan2(b, a) * (180/Math.PI));
        } else { var angle = 0; }
        return (angle < 0) ? angle + 360 : angle;
    }

    getServerInformations(
        serverCpu,
        serverRam,
        serverDisk,
        serverOs
    ) {
        client.get('api/server/informations')
        .catch((error) => {
            toast.error('Unable to reach server informations');
        })
        .then((response) => {

            const { cpuUsage, ramUsage, diskUsage, os: osUsed } = response.data;
            const { setServerInformations } = this.props;

            const cpu = document.querySelector('.cpu .load');
            const ram = document.querySelector('.ram .load');
            const disk = document.querySelector('.disk .load');
            const platform = document.querySelector('#platform > h4');
            const cpuText = document.querySelector('.machine-cpu');
            const ramText = document.querySelector('.machine-ram');
            const diskText = document.querySelector('.machine-disk');

            platform.classList.remove('red-text');
            platform.textContent = (serverOs ??= osUsed);
            cpu.style.transform = "rotate(" + Math.round(180 * (serverCpu ??= cpuUsage) / 100) + "deg)";
            ram.style.transform = "rotate(" + Math.round(180 * (serverRam ??= ramUsage) / 100) + "deg)";
            disk.style.transform = "rotate(" + Math.round(180 * (serverDisk ??= diskUsage) / 100) + "deg)";
            cpuText.textContent = "CPU: " + Math.round(serverCpu ??= cpuUsage) + "%";
            ramText.textContent = "RAM: " + Math.round(serverRam ??= ramUsage) + "%";
            diskText.textContent = "DISK: " + Math.round(serverDisk ??= diskUsage) + "%";

            setServerInformations(cpuUsage, ramUsage, diskUsage, osUsed);
        })
    }

    componentDidMount() {
        const { serverCpu, serverRam, serverDisk, serverOs } = this.props;
        if(serverCpu, serverRam, serverDisk, serverOs === null) {
            this.getServerInformations()
        }

        setInterval(() => {this.getServerInformations(
            serverCpu,
            serverRam,
            serverDisk,
            serverOs
        )}, 60000 * 10)
    };

    render() {
        return (
            <main>
                <div id="presentation row">
                    <h3>PLATFORM</h3>
                    <div id="platform" className="col s12">
                        <h4>
                            <Preloader
                                active
                            />
                        </h4>
                    </div>
                </div>
                <div id="main-table" className="row">
                    <div className="machine-container cpu col s12 m12 l4 xl4">
                        <div className="machine-cpu circle-load">
                            <Preloader
                                active
                                size="small"
                                color="green"
                            />
                        </div>
                        <div className="load"></div>
                    </div>
                    <div className="machine-container ram col s12 m12 l4 xl4">
                        <div className="machine-ram circle-load">
                            <Preloader
                                active
                                size="small"
                                color="green"
                            />
                        </div>
                        <div className="load"></div>
                    </div>
                    <div className="machine-container disk col s12 m12 l4 xl4">
                        <div className="machine-disk circle-load">
                        <Preloader
                            active
                            size="small"
                            color="green"
                        />
                        </div>
                        <div className="load"></div>
                    </div>
                </div>
            </main>
    )
    }
};

export default Home;
