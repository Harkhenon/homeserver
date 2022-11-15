// == Import : npm
import { connect } from 'react-redux';


// == Import : local
import Domains from '../../../components/Components/Domains';
import { controlFormInput, storeData, getDomains } from '../../../store/reducer';


/* === State (données) ===
* - mapStateToProps retroune un objet de props pour le composant de présentation
* - mapStateToProps met à dispo 2 params
*  - state : le state du store (getState)
*  - ownProps : les props passées au container
* Pas de data à transmettre ? const mapStateToProps = null;
*/
const mapStateToProps = (state, ownProps) => ({
    domains: state.domains ?? null,
    addModalOpened: state.addModalOpened ?? null,
    domain: state.domain ?? null,
    nsserver1: state.nsserver1 ?? null,
    nsserver2: state.nsserver2 ?? null,
    editModalOpened: state.editModalOpened ?? null,
    editDomain: state.editDomain ?? null,
    loading: state.loading ?? null,
});


/* === Actions ===
* - mapDispatchToProps retroune un objet de props pour le composant de présentation
* - mapDispatchToProps met à dispo 2 params
*  - dispatch : la fonction du store pour dispatcher une actio
*  - ownProps : les props passées au container
* Pas de disptach à transmettre ? const mapDispatchToProps = {};
*/
const mapDispatchToProps = (dispatch, ownProps) => ({
    storeData: (name, data) => (dispatch(storeData(name, data))),
    controlFormInput: (name, value) => (dispatch(controlFormInput(name, value))),
    getDomains: () => (dispatch(getDomains())),
});


// Container
const DomainsContainer = connect(
mapStateToProps,
mapDispatchToProps,
)(Domains);


// == Export
export default DomainsContainer;


/* = export à la volée
export default connect(
mapStateToProps,
mapDispatchToProps,
)(Domains);
*/