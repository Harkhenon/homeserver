// == Import : npm
import { connect } from 'react-redux';


// == Import : local
import Settings from '../../components/Settings';
import { controlFormInput, controlFormErrors } from '../../store/reducer'


/* === State (données) ===
* - mapStateToProps retroune un objet de props pour le composant de présentation
* - mapStateToProps met à dispo 2 params
*  - state : le state du store (getState)
*  - ownProps : les props passées au container
* Pas de data à transmettre ? const mapStateToProps = null;
*/
const mapStateToProps = (state, ownProps) => ({
    serverHostname: state.serverHostname ?? "",
    serverMainemail: state.serverMainemail ?? "",
    serverDomain: state.serverDomain ?? "",
    serverIp: state.serverIp ?? "",
});


/* === Actions ===
* - mapDispatchToProps retroune un objet de props pour le composant de présentation
* - mapDispatchToProps met à dispo 2 params
*  - dispatch : la fonction du store pour dispatcher une actio
*  - ownProps : les props passées au container
* Pas de disptach à transmettre ? const mapDispatchToProps = {};
*/
const mapDispatchToProps = (dispatch, ownProps) => ({
    controlFormInput: (name, value) => (dispatch(controlFormInput(name, value))),
    controlFormErrors: (errors) => (dispatch(controlFormErrors(errors))),
});


// Container
const SettingsContainer = connect(
mapStateToProps,
mapDispatchToProps,
)(Settings);


// == Export
export default SettingsContainer;


/* = export à la volée
export default connect(
mapStateToProps,
mapDispatchToProps,
)(Settings);
*/